// =============================================
// utils/backup.js - Sistema de Backup
// =============================================
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');

class BackupManager {
    constructor() {
        this.backupDir = path.join(__dirname, '../backups');
    }

    async createBackup() {
        try {
            // Asegurar que existe el directorio de backups
            await fs.mkdir(this.backupDir, { recursive: true });

            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const filename = `backup_${timestamp}.sql`;
            const filepath = path.join(this.backupDir, filename);

            const command = `mysqldump -h ${process.env.DB_HOST} -P ${process.env.DB_PORT} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} > ${filepath}`;

            return new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    
                    console.log(`✅ Backup creado: ${filename}`);
                    resolve(filepath);
                });
            });

        } catch (error) {
            console.error('❌ Error creando backup:', error);
            throw error;
        }
    }

    async restoreBackup(backupFile) {
        try {
            const command = `mysql -h ${process.env.DB_HOST} -P ${process.env.DB_PORT} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${backupFile}`;

            return new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    
                    console.log(`✅ Backup restaurado: ${backupFile}`);
                    resolve();
                });
            });

        } catch (error) {
            console.error('❌ Error restaurando backup:', error);
            throw error;
        }
    }

    async listBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backupFiles = files
                .filter(file => file.endsWith('.sql'))
                .map(file => ({
                    filename: file,
                    path: path.join(this.backupDir, file),
                    created: moment(file.replace('backup_', '').replace('.sql', ''), 'YYYY-MM-DD_HH-mm-ss').toDate()
                }))
                .sort((a, b) => b.created - a.created);

            return backupFiles;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async cleanOldBackups(daysToKeep = 30) {
        try {
            const cutoffDate = moment().subtract(daysToKeep, 'days').toDate();
            const backups = await this.listBackups();
            
            let deleted = 0;
            for (const backup of backups) {
                if (backup.created < cutoffDate) {
                    await fs.unlink(backup.path);
                    deleted++;
                    console.log(`🗑️ Backup eliminado: ${backup.filename}`);
                }
            }

            console.log(`✅ Limpieza completada. ${deleted} backups eliminados.`);
            return deleted;

        } catch (error) {
            console.error('❌ Error limpiando backups:', error);
            throw error;
        }
    }
}

module.exports = BackupManager;