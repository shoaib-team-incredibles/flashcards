/**
 * KnowDeck only schedules local notifications (the daily quote), which need no
 * push entitlement. expo-notifications adds `aps-environment` anyway, and the
 * App Store provisioning profile doesn't include Push Notifications, so the
 * build fails at signing. Remove the entitlement.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
