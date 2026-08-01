// function todayStr() {
//   return new Date().toISOString().slice(0, 10);
// }

// module.exports = {
//   todayStr,
//   staffRepo: require('./staffRepo'),
//   routesRepo: require('./routesRepo'),
//   registrationsRepo: require('./registrationsRepo'),
//   allocationsRepo: require('./allocationsRepo'),
//   sessionsRepo: require('./sessionsRepo'),
//   auditRepo: require('./auditRepo'),
// };
// Nigeria (WAT) is a fixed UTC+1 offset with no daylight saving time, so this
// never needs to change. Using this instead of new Date().toISOString() keeps
// "today" consistent with Lagos wall-clock time regardless of the server's
// own timezone setting.

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function todayStr() {
  return new Date(Date.now() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

module.exports = {
  todayStr,
  staffRepo: require('./staffRepo'),
  routesRepo: require('./routesRepo'),
  registrationsRepo: require('./registrationsRepo'),
  allocationsRepo: require('./allocationsRepo'),
  sessionsRepo: require('./sessionsRepo'),
  auditRepo: require('./auditRepo'),
};