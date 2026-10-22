export const getHttpUrl = value => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username && !url.password
      ? url
      : null
  } catch {
    return null
  }
}
