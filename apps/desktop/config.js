'use strict';

const appUrl = process.env.RB_APP_URL || 'http://127.0.0.1:8080/index.html';
const parsed = new URL(appUrl);

module.exports = {
  appUrl,
  appOrigin: parsed.origin,
  internalHost: process.env.RB_INTERNAL_HOST || parsed.hostname,
  internalHome: process.env.RB_INTERNAL_HOME || parsed.origin + '/',
  loginUrl: process.env.RB_LOGIN_URL || '',
  sessionCookieName: process.env.RB_SESSION_COOKIE || '',
  versionUrl: process.env.RB_VERSION_URL || '',
  updateZipUrl: process.env.RB_UPDATE_ZIP_URL || '',
  downloadUrl: process.env.RB_DOWNLOAD_URL || '',
  accioExe: process.env.ACCIO_EXE || ''
};
