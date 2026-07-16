const validThemes = new Set(['browser', 'dark', 'light'])

const applyTheme = themeMode => {
  document.documentElement.dataset.theme = validThemes.has(themeMode)
    ? themeMode
    : 'browser'
}

chrome.storage.local.get('themeMode', ({ themeMode }) => applyTheme(themeMode))

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.themeMode) {
    applyTheme(changes.themeMode.newValue)
  }
})
