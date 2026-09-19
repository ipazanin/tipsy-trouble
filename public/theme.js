;(() => {
  const storageKey = 'tipsy-trouble-theme'
  const root = document.documentElement
  const deviceTheme = window.matchMedia('(prefers-color-scheme: dark)')
  const backgrounds = { light: '#faf7f0', dark: '#131d27' }
  const normalize = (preference) =>
    preference === 'light' || preference === 'dark' ? preference : 'system'
  let preference = 'system'

  try {
    preference = normalize(localStorage.getItem(storageKey))
  } catch {
    // The theme remains usable when browser storage is unavailable.
  }

  function apply() {
    const theme = preference === 'system' ? (deviceTheme.matches ? 'dark' : 'light') : preference
    root.dataset.theme = theme
    root.dataset.themePreference = preference
    root.style.colorScheme = theme
    root.style.setProperty('--background', backgrounds[theme])
    root.style.backgroundColor = backgrounds[theme]
    document.querySelector('meta[name="theme-color"]').setAttribute('content', backgrounds[theme])
    window.dispatchEvent(new Event('tipsy-theme-change'))
  }

  window.tipsyTheme = {
    setPreference(nextPreference) {
      preference = normalize(nextPreference)
      try {
        localStorage.setItem(storageKey, preference)
      } catch {
        // Apply the choice for this tab even when it cannot be persisted.
      }
      apply()
    },
  }

  deviceTheme.addEventListener('change', () => {
    if (preference === 'system') apply()
  })
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
      preference = normalize(event.newValue)
      apply()
    }
  })
  apply()
})()
