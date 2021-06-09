const ServiceRegistry = require("../frame/service_registry");

module.exports = class KlaytnRegistry extends ServiceRegistry {
  /**
   * @override
   */
  checkConnection() {
    console.log(
      "I: Klaytn service registry not implemented, so pass connection of service registry"
    );
  }

  /**
   * @override
   */
  updateLeader() {
    console.log(
      "I: Klaytn service registry not implemented, so pass to update leader in service registry"
    );
  }

  /**
   * @override
   */
  backupLog() {
    console.log(
      "I: Klaytn service registry not implemented, so pass to backup leader in service registry"
    );
  }

  /**
   * @override
   */
  getLatestBackupLog() {
    console.log(
      "I: Klaytn service registry not implemented, so pass to get backup-access-key leader in service registry"
    );
  }
};
