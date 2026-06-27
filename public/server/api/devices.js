class DevicesHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    handleGetDevices(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const devices = this.dataManager.getUserDevices(user.id);
        this.securitySystem.logSecurityEvent(user, 'GET_DEVICES', `count:${devices.length}`);

        return {
            success: true,
            devices: devices
        };
    }

    handleTerminateDevice(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { deviceId } = data;
        const success = this.dataManager.terminateDevice(user.id, deviceId);

        if (success) {
            this.securitySystem.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`);
            return {
                success: true,
                message: 'Сеанс устройства завершен'
            };
        } else {
            this.securitySystem.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`, false);
            return {
                success: false,
                message: 'Не удалось завершить сеанс устройства'
            };
        }
    }
}

module.exports = DevicesHandler;
