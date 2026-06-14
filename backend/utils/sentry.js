// Sentry replaced by OpenObserve. These stubs preserve the old import surface
// so any callers that haven't been updated yet continue to compile.
export const initSentry          = async (_app) => {};
export const getSentryErrorHandler = () => (_err, _req, _res, next) => next(_err);
export const captureException    = () => {};
export const captureMessage      = () => {};
export const setUser             = () => {};
export const clearUser           = () => {};
export const startTransaction    = () => ({ finish: () => {} });
export default { initSentry, getSentryErrorHandler, captureException, captureMessage, setUser, clearUser, startTransaction };
