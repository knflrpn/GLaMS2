// GLaMS Roulette System - Common Components
import { GLaMSController } from '../src/utils/GLaMSController.js';

// =======================
// SHARED CONSTANTS & UTILITIES
// =======================
export const ROOM_NAME = 'roulette';
export const COLORS = [
	'#ff6b6b', '#4ecdc4', '#45b7d1', '#f6d365', '#a78bfa',
	'#60a5fa', '#f472b6', '#34d399', '#f59e0b', '#e879f9',
	'#2dd4bf', '#fca5a5', '#93c5fd', '#fde68a', '#86efac'
];

// Utility: wrap angle to (-π, π]
export const wrapPi = a => {
	const TWO_PI = Math.PI * 2;
	a = (a + Math.PI) % TWO_PI;
	if (a < 0) a += TWO_PI;
	return a - Math.PI;
};

// Shared logging function
export function log(message, type = 'info', container = null) {
	const entry = document.createElement('div');
	entry.className = 'message';

	const timestamp = document.createElement('span');
	timestamp.className = 'timestamp';
	timestamp.textContent = `[${new Date().toLocaleTimeString()}]`;

	const content = document.createElement('span');
	content.textContent = ` ${message}`;
	content.style.color = type === 'error' ? '#ef4444' :
		type === 'success' ? '#22c55e' : '#e0e0e0';

	entry.appendChild(timestamp);
	entry.appendChild(content);

	if (container) {
		container.appendChild(entry);
		container.scrollTop = container.scrollHeight;
	} else {
		console.log(`[${type.toUpperCase()}] ${message}`);
	}
}

// =======================
// CONNECTION MANAGER CLASS
// =======================
export class ConnectionManager {
	constructor(options = {}) {
		this.controller = null;
		this.currentRoom = null;
		this.isConnected = false;

		// Callbacks
		this.onConnect = options.onConnect || (() => { });
		this.onDisconnect = options.onDisconnect || (() => { });
		this.onError = options.onError || (() => { });
	}

	async connect(roomName, connectionType = 'browser') {
		try {
			this.controller = new GLaMSController({
				onConnect: (info) => {
					this.isConnected = true;
					this.currentRoom = roomName;
					this.onConnect(info);
				},
				onDisconnect: (reason) => {
					this.isConnected = false;
					this.currentRoom = null;
					this.onDisconnect(reason);
				},
				onError: (error) => {
					this.isConnected = false;
					this.onError(error);
				}
			});

			await this.controller.connect(roomName, connectionType);
			return true;
		} catch (error) {
			this.isConnected = false;
			this.controller = null;
			throw error;
		}
	}

	disconnect() {
		if (this.controller) {
			this.controller.disconnect();
			this.controller = null;
		}
		this.isConnected = false;
		this.currentRoom = null;
	}

	async addManipulator(manipulatorType) {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.addManipulator(type = manipulatorType);
	}

	async clearPipeline() {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.clearPipeline();
	}

	async resetManipulatorConfigs() {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.resetManipulatorConfigs();
	}

	async disableAllManipulators() {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.disableManipulators();
	}

	async getManipulators() {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.getManipulators();
	}

	async getManipulatorActions(manipulatorId) {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.getManipulatorActions(manipulatorId);
	}

	async executeAction(manipulatorId, actionName, parameters = {}) {
		if (!this.controller || !this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}
		return await this.controller.executeAction(manipulatorId, actionName, parameters);
	}
}