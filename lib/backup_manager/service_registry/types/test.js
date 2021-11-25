const ServiceRegistry = require("../frame/service_registry");

module.exports = class TestRegistry extends ServiceRegistry {
  /**
   * @override
   */
  checkConnection() {
    console.log(
      "I: Currently not using service registry, so pass connection of service registry"
    );
  }

  /**
   * @override
   */
  updateLeader() {
    console.log(
      "I: Currently not using service registry, so pass to update leader in service registry"
    );
  }

  /**
   * @override
   */
  backupLog(log) {
    console.log(log);
    console.log(
      "I: Currently not using service registry, so pass to backup leader in service registry"
    );
  }

  /**
   * @override
   */
   getLatestStateVersion() {
    console.log(
      "I: Currently not using service registry, so pass to get backup-access-key leader in service registry"
    );
    return 1;
  }


  /**
   * @override
   */
  getLatestBackupLog() {
    console.log(
      "I: Currently not using service registry, so pass to get backup-access-key leader in service registry"
    );
  }
};
