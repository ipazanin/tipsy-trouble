import { computed, ref, shallowRef, watch } from 'vue'
import { t } from '@/app/i18n'
import { library } from '@/app/library'
import { useGameSession } from '@/features/game/composables/useGameSession'
import {
  authorizeCommand,
  parseGuestMessage,
  parseHostMessage,
  publicGame,
  type GuestCommand,
  type HostMessage,
  type SharedSnapshot,
} from '../domain/protocol'
import { extractPairingToken } from '../infrastructure/pairingCodec'
import {
  createPeerTransport,
  type PeerTransport,
  type PeerTransportStatus,
} from '../infrastructure/peerTransport'

export const MAX_GUEST_DEVICES = 12

export interface HostConnectionView {
  readonly id: string
  readonly playerId: string
  readonly status: PeerTransportStatus
  readonly error: string
  readonly offer: string
}

type CommandResult = Extract<HostMessage, { type: 'result' }>
interface HostConnection {
  readonly id: string
  readonly playerId: string
  readonly transport: PeerTransport
  readonly commands: Map<string, CommandResult | null>
}

async function loadCurrentArtwork(imageId: string): Promise<string | undefined> {
  const image = await library.loadCardImage(imageId)
  if (!image) return undefined
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(t('multiplayer.errors.artwork')))
    reader.readAsDataURL(new Blob([image.bytes], { type: 'image/jpeg' }))
  })
}

export function createMultiplayer(
  session = useGameSession(),
  transportFactory = createPeerTransport,
  loadArtwork = loadCurrentArtwork,
) {
  const hostActive = ref(false)
  const hostConnections = shallowRef<readonly HostConnectionView[]>([])
  const hostError = ref('')
  const guestStatus = ref<PeerTransportStatus>('idle')
  const guestAnswer = ref('')
  const guestState = shallowRef<SharedSnapshot | null>(null)
  const guestError = ref('')
  const guestBusy = ref(false)
  const connections = new Map<string, HostConnection>()
  let roomId = ''
  let revision = 0
  let guestTransport: PeerTransport | undefined
  let guestGeneration = 0
  let pendingCommand: { id: string; revision: number; accepted: boolean } | undefined
  let commandTimer: ReturnType<typeof setTimeout> | undefined
  let artworkCache: { id: string; promise: Promise<string | undefined> } | undefined

  const guestActive = computed(() => guestStatus.value !== 'idle')
  const guestConnected = computed(() => guestStatus.value === 'connected')
  const multiplayerActive = computed(() => hostActive.value || guestActive.value)
  const canGuestAdvance = computed(() => {
    const snapshot = guestState.value
    return (
      guestStatus.value === 'connected' &&
      !guestBusy.value &&
      !!snapshot &&
      snapshot.game.phase === 'turn' &&
      snapshot.game.players[snapshot.game.currentPlayerIndex]!.id === snapshot.assignedPlayerId
    )
  })
  const canGuestAddRule = computed(() => {
    const snapshot = guestState.value
    return (
      guestStatus.value === 'connected' &&
      !guestBusy.value &&
      !!snapshot &&
      snapshot.game.phase === 'house-rule' &&
      snapshot.game.players[snapshot.game.houseRules.length]!.id === snapshot.assignedPlayerId
    )
  })

  function failureText(failure: unknown): string {
    return failure instanceof Error ? failure.message : t('common.error')
  }

  function updateConnection(id: string, change: Partial<HostConnectionView>) {
    hostConnections.value = hostConnections.value.map((connection) =>
      connection.id === id ? { ...connection, ...change } : connection,
    )
  }

  function connected(connection: HostConnection): boolean {
    return (
      connections.get(connection.id) === connection &&
      hostConnections.value.some((view) => view.id === connection.id && view.status === 'connected')
    )
  }

  async function sendHost(connection: HostConnection, message: HostMessage) {
    if (!connected(connection)) return
    try {
      await connection.transport.send(JSON.stringify(message))
    } catch (failure) {
      if (connections.get(connection.id) !== connection) return
      connection.transport.close()
      updateConnection(connection.id, { status: 'failed', error: failureText(failure) })
    }
  }

  async function publish(connection?: HostConnection) {
    const game = session.gameSession.value
    if (!hostActive.value || !game) return
    const publishedRoom = roomId
    const publishedRevision = revision
    let currentArtwork: string | undefined
    const imageId = game.currentCard?.imageId
    if (imageId) {
      if (artworkCache?.id !== imageId)
        artworkCache = { id: imageId, promise: loadArtwork(imageId) }
      const requestedArtwork = artworkCache
      try {
        currentArtwork = await requestedArtwork.promise
      } catch {
        if (hostActive.value && publishedRoom === roomId && publishedRevision === revision) {
          hostError.value = t('multiplayer.errors.artwork')
          if (artworkCache === requestedArtwork) artworkCache = undefined
        }
      }
    }
    if (!hostActive.value || publishedRoom !== roomId || publishedRevision !== revision) return
    const recipients = connection ? [connection] : [...connections.values()]
    await Promise.all(
      recipients.map((recipient) =>
        sendHost(recipient, {
          version: 1,
          type: 'snapshot',
          snapshot: {
            roomId,
            revision,
            assignedPlayerId: recipient.playerId,
            game: publicGame(game),
            ...(currentArtwork === undefined ? {} : { currentArtwork }),
          },
        }),
      ),
    )
  }

  async function handleGuest(connection: HostConnection, serialized: string) {
    if (!connected(connection)) return
    try {
      const message = parseGuestMessage(serialized)
      if (message.type === 'ready') {
        await publish(connection)
        return
      }
      const { command } = message
      if (connection.commands.has(command.commandId)) {
        const previous = connection.commands.get(command.commandId)
        if (previous) await sendHost(connection, previous)
        return
      }
      const game = session.gameSession.value
      if (!game || !hostActive.value) return
      const reason = authorizeCommand(command, {
        roomId,
        revision,
        game,
        playerId: connection.playerId,
        busy: session.sessionBusy.value || !session.sessionLoaded.value,
      })
      connection.commands.set(command.commandId, null)
      if (connection.commands.size > 256) {
        connection.commands.delete(connection.commands.keys().next().value!)
      }
      let result: CommandResult
      if (reason) {
        result = {
          version: 1,
          type: 'result',
          commandId: command.commandId,
          accepted: false,
          reason,
        }
      } else {
        const saved =
          command.action === 'advance'
            ? await session.nextTurn(command.targetId)
            : await session.addHouseRule(command.text)
        result = saved
          ? { version: 1, type: 'result', commandId: command.commandId, accepted: true }
          : {
              version: 1,
              type: 'result',
              commandId: command.commandId,
              accepted: false,
              reason: 'save-failed',
            }
      }
      connection.commands.set(command.commandId, result)
      await publish(connection)
      await sendHost(connection, result)
    } catch (failure) {
      if (connections.get(connection.id) !== connection) return
      connection.transport.close()
      updateConnection(connection.id, { status: 'failed', error: failureText(failure) })
    }
  }

  function startHosting() {
    hostError.value = ''
    if (guestActive.value) {
      hostError.value = t('multiplayer.errors.leaveGuest')
      return
    }
    if (!session.sessionLoaded.value || !session.gameSession.value) {
      hostError.value = t('multiplayer.errors.startGame')
      return
    }
    if (hostActive.value) return
    roomId = crypto.randomUUID()
    revision = 0
    hostActive.value = true
  }

  function removeGuest(id: string) {
    const connection = connections.get(id)
    connections.delete(id)
    hostConnections.value = hostConnections.value.filter((view) => view.id !== id)
    connection?.transport.close()
  }

  async function pairPlayer(playerId: string) {
    startHosting()
    if (!hostActive.value) return
    if (!session.gameSession.value!.players.some((player) => player.id === playerId)) {
      hostError.value = t('multiplayer.errors.player')
      return
    }
    const previous = hostConnections.value.find((connection) => connection.playerId === playerId)
    if (previous) removeGuest(previous.id)
    if (connections.size >= MAX_GUEST_DEVICES) {
      hostError.value = t('multiplayer.errors.limit', { count: MAX_GUEST_DEVICES })
      return
    }
    const id = crypto.randomUUID()
    hostConnections.value = [
      ...hostConnections.value,
      { id, playerId, status: 'idle', error: '', offer: '' },
    ]
    const transport = transportFactory({
      onStatus: (status) => updateConnection(id, { status }),
      onError: (failure) => updateConnection(id, { error: failure.message }),
      onMessage: (serialized) => {
        const connection = connections.get(id)
        if (connection) void handleGuest(connection, serialized)
      },
    })
    const connection: HostConnection = { id, playerId, transport, commands: new Map() }
    connections.set(id, connection)
    try {
      const offer = await transport.createOffer()
      if (connections.get(id) === connection) updateConnection(id, { offer })
    } catch (failure) {
      if (connections.get(id) === connection)
        updateConnection(id, { status: 'failed', error: failureText(failure) })
    }
  }

  async function acceptGuestAnswer(id: string, token: string) {
    const connection = connections.get(id)
    if (!connection) return
    updateConnection(id, { error: '' })
    try {
      await connection.transport.acceptAnswer(extractPairingToken(token))
    } catch (failure) {
      if (connections.get(id) === connection) updateConnection(id, { error: failureText(failure) })
    }
  }

  function stopHosting() {
    hostActive.value = false
    roomId = ''
    artworkCache = undefined
    for (const connection of connections.values()) {
      if (connected(connection)) {
        void connection.transport
          .send(JSON.stringify({ version: 1, type: 'ended' }))
          .catch(() => undefined)
          .finally(() => setTimeout(() => connection.transport.close(), 250))
      } else connection.transport.close()
    }
    connections.clear()
    hostConnections.value = []
    hostError.value = ''
  }

  function clearPending() {
    clearTimeout(commandTimer)
    pendingCommand = undefined
    guestBusy.value = false
  }

  function leaveGuest() {
    guestGeneration++
    const previous = guestTransport
    guestTransport = undefined
    previous?.close()
    clearPending()
    guestStatus.value = 'idle'
    guestState.value = null
    guestAnswer.value = ''
    guestError.value = ''
  }

  function failGuest(failure: unknown) {
    guestTransport?.close()
    guestStatus.value = 'failed'
    guestError.value = failureText(failure)
    clearPending()
  }

  function receiveHost(serialized: string) {
    try {
      const message = parseHostMessage(serialized)
      if (message.type === 'ended') {
        guestTransport?.close()
        guestStatus.value = 'closed'
        guestError.value = t('multiplayer.errors.ended')
        clearPending()
      } else if (message.type === 'snapshot') {
        const previous = guestState.value
        if (
          previous &&
          (message.snapshot.roomId !== previous.roomId ||
            message.snapshot.assignedPlayerId !== previous.assignedPlayerId)
        ) {
          throw new Error(t('multiplayer.errors.changedRoom'))
        }
        if (!previous || message.snapshot.revision > previous.revision)
          guestState.value = message.snapshot
        if (pendingCommand?.accepted && guestState.value!.revision > pendingCommand.revision)
          clearPending()
      } else if (message.commandId === pendingCommand?.id) {
        if (message.accepted) {
          pendingCommand.accepted = true
          if (guestState.value!.revision > pendingCommand.revision) clearPending()
        } else {
          clearPending()
          guestError.value = t(`multiplayer.rejections.${message.reason}`)
        }
      }
    } catch (failure) {
      failGuest(failure)
    }
  }

  async function joinHost(token: string): Promise<boolean> {
    if (hostActive.value) {
      guestError.value = t('multiplayer.errors.stopHost')
      return false
    }
    leaveGuest()
    const generation = guestGeneration
    guestStatus.value = 'pairing'
    const transport = transportFactory({
      onStatus: (status) => {
        if (generation !== guestGeneration || status === 'idle') return
        guestStatus.value = status
        if (status === 'connected') {
          guestAnswer.value = ''
          void transport.send(JSON.stringify({ version: 1, type: 'ready' })).catch((failure) => {
            if (generation === guestGeneration) failGuest(failure)
          })
        } else if (status === 'closed' || status === 'failed') clearPending()
      },
      onError: (failure) => {
        if (generation === guestGeneration) guestError.value = failure.message
      },
      onMessage: (serialized) => {
        if (generation === guestGeneration) receiveHost(serialized)
      },
    })
    guestTransport = transport
    try {
      const answer = await transport.acceptOffer(extractPairingToken(token))
      if (generation !== guestGeneration) return false
      if (!guestConnected.value) guestAnswer.value = answer
      return true
    } catch (failure) {
      if (generation === guestGeneration) failGuest(failure)
      return false
    }
  }

  async function sendCommand(
    action: { action: 'advance'; targetId?: string } | { action: 'house-rule'; text: string },
  ) {
    const snapshot = guestState.value
    if (!snapshot || !guestTransport || guestBusy.value || guestStatus.value !== 'connected') return
    const command: GuestCommand = {
      ...action,
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      roomId: snapshot.roomId,
    }
    pendingCommand = { id: command.commandId, revision: snapshot.revision, accepted: false }
    guestBusy.value = true
    guestError.value = ''
    const generation = guestGeneration
    commandTimer = setTimeout(() => failGuest(new Error(t('multiplayer.errors.timeout'))), 20000)
    try {
      await guestTransport.send(JSON.stringify({ version: 1, type: 'command', command }))
    } catch (failure) {
      if (generation === guestGeneration) failGuest(failure)
    }
  }

  const stopWatchingGame = watch(
    session.gameSession,
    (game) => {
      if (!hostActive.value) return
      if (!game) stopHosting()
      else {
        revision++
        void publish()
      }
    },
    { flush: 'sync' },
  )
  const stopWatchingLoaded = watch(
    session.sessionLoaded,
    (loaded) => {
      if (!loaded && hostActive.value) stopHosting()
    },
    { flush: 'sync' },
  )

  return {
    hostActive,
    hostConnections,
    hostError,
    guestStatus,
    guestAnswer,
    guestState,
    guestError,
    guestBusy,
    guestActive,
    multiplayerActive,
    canGuestAdvance,
    canGuestAddRule,
    startHosting,
    pairPlayer,
    acceptGuestAnswer,
    removeGuest,
    stopHosting,
    joinHost,
    leaveGuest,
    guestNextTurn: (targetId?: string) =>
      canGuestAdvance.value
        ? sendCommand({ action: 'advance', ...(targetId ? { targetId } : {}) })
        : Promise.resolve(),
    guestAddHouseRule: (text: string) =>
      canGuestAddRule.value ? sendCommand({ action: 'house-rule', text }) : Promise.resolve(),
    pairingLink: (token: string) =>
      `${window.location.origin}${import.meta.env.BASE_URL}#/multiplayer?pair=${encodeURIComponent(token)}`,
    dispose() {
      stopWatchingGame()
      stopWatchingLoaded()
      stopHosting()
      leaveGuest()
    },
  }
}

const multiplayer = createMultiplayer()
export function useMultiplayer() {
  return multiplayer
}
if (import.meta.hot) import.meta.hot.dispose(() => multiplayer.dispose())
