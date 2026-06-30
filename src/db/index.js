function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
