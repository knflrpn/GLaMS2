// ./src/core/ConnectionManager.js

import { SwiCCSink } from './SwiCCSink.js';

/**
 * ConnectionManager handles all SwiCC device connections
 * Manages connection state, multiple devices, and coordinates with the engine
 */
export class ConnectionManager {
	constructor(engine, uiManager) {
		this.engine = engine;
		this.uiManager = uiManager;
		this.swiccSinks = new Map();

		this.setupEventListeners();
	}

	/**
	 * Setup event listeners for all connection buttons
	 */
	setupEventListeners() {
		// Setup connection buttons for all 4 possible SwiCC connections
		for (let i = 0; i < 4; i++) {
			this.uiManager.addEventListenerSafe(`connectBtn${i}`, 'click', () => {
				this.connectToSwiCC(i);
			});

			this.uiManager.addEventListenerSafe(`disconnectBtn${i}`, 'click', () => {
				this.disconnectFromSwiCC(i);
			});
		}

		// Add more SwiCCs button
		this.uiManager.addEventListenerSafe('addMoreSwiCCsBtn', 'click', () => {
			this.uiManager.toggleAdditionalSwiCCs();
		});
	}

	/**
	 * Connect to a specific SwiCC device
	 * @param {number} swiccId - SwiCC identifier (0-3)
	 */
	async connectToSwiCC(swiccId) {
		const connectBtn = document.getElementById(`connectBtn${swiccId}`);

		try {
			// Disable connect button immediately to prevent double-clicks
			if (connectBtn) {
				connectBtn.disabled = true;
			}

			this.uiManager.logMessage(`Requesting serial port for SwiCC #${swiccId + 1}...`);

			// Create SwiCC sink with callbacks
			const swiccSink = new SwiCCSink({
				onDisconnect: () => this.handleSwiCCDisconnect(swiccId),
				logMessage: (msg) => this.uiManager.logMessage(`SwiCC #${swiccId + 1}: ${msg}`)
			});

			// Attempt connection
			await swiccSink.connect();

			// Store the sink for management
			this.swiccSinks.set(swiccId, swiccSink);

			// Add sink to engine for data flow
			this.engine.addSink(`swicc${swiccId}`, swiccSink);

			// Update UI to reflect connection
			this.updateConnectionStatus(swiccId, true);

			this.uiManager.logMessage(`Connected to SwiCC #${swiccId + 1} successfully!`);

			// Start engine if this is the first connection
			if (this.swiccSinks.size === 1) {
				this.engine.start();
				this.uiManager.logMessage('Engine started');
			}

		} catch (error) {
			this.uiManager.logMessage(`SwiCC #${swiccId + 1} connection failed: ${error.message}`);

			// Re-enable connect button on failure
			if (connectBtn) {
				connectBtn.disabled = false;
			}

			// Clean up any partial connection
			this.cleanupConnection(swiccId);
		}
	}

	/**
	 * Disconnect from a specific SwiCC device
	 * @param {number} swiccId - SwiCC identifier (0-3)
	 */
	async disconnectFromSwiCC(swiccId) {
		try {
			const swiccSink = this.swiccSinks.get(swiccId);

			if (swiccSink) {
				// Remove from engine first
				this.engine.removeSink(`swicc${swiccId}`);

				// Disconnect the device
				await swiccSink.disconnect();

				// Remove from tracking
				this.swiccSinks.delete(swiccId);
			}

			// Update UI
			this.updateConnectionStatus(swiccId, false);

			this.uiManager.logMessage(`Disconnected from SwiCC #${swiccId + 1}`);

			// Stop engine if no more connections
			if (this.swiccSinks.size === 0) {
				this.engine.stop();
				this.uiManager.logMessage('Engine stopped - no SwiCC connections remaining');
			}

		} catch (error) {
			this.uiManager.logMessage(`SwiCC #${swiccId + 1} disconnect error: ${error.message}`);
		}
	}

	/**
	 * Handle unexpected disconnection of a SwiCC device
	 * @param {number} swiccId - SwiCC identifier that disconnected
	 */
	handleSwiCCDisconnect(swiccId) {
		this.uiManager.logMessage(`SwiCC #${swiccId + 1} disconnected unexpectedly`);

		// Clean up the connection
		this.cleanupConnection(swiccId);
		this.updateConnectionStatus(swiccId, false);

		// Stop engine if no more connections
		if (this.swiccSinks.size === 0) {
			this.engine.stop();
			this.uiManager.logMessage('Engine stopped - no SwiCC connections remaining');
		}
	}

	/**
	 * Clean up a connection without going through normal disconnect process
	 * Used for error handling and unexpected disconnections
	 * @param {number} swiccId - SwiCC identifier to clean up
	 */
	cleanupConnection(swiccId) {
		// Remove from engine if present
		try {
			this.engine.removeSink(`swicc${swiccId}`);
		} catch (error) {
			// Ignore errors - sink might not have been added yet
		}

		// Remove from tracking
		this.swiccSinks.delete(swiccId);
	}

	/**
	 * Update the connection status in the UI
	 * @param {number} swiccId - SwiCC identifier
	 * @param {boolean} connected - Connection state
	 */
	updateConnectionStatus(swiccId, connected) {
		// Update individual SwiCC status
		this.uiManager.updateSwiCCStatus(swiccId, connected);

		// Update overall connection count
		this.uiManager.updateConnectedCount(this.swiccSinks.size);
	}

	/**
	 * Get the connection status for a specific SwiCC
	 * @param {number} swiccId - SwiCC identifier
	 * @returns {boolean} True if connected, false otherwise
	 */
	isConnected(swiccId) {
		return this.swiccSinks.has(swiccId);
	}

	/**
	 * Get the total number of connected devices
	 * @returns {number} Number of connected SwiCC devices
	 */
	getConnectedCount() {
		return this.swiccSinks.size;
	}

	/**
	 * Get all connected SwiCC IDs
	 * @returns {Array<number>} Array of connected SwiCC IDs
	 */
	getConnectedIds() {
		return Array.from(this.swiccSinks.keys());
	}

	/**
	 * Get a specific SwiCC sink instance
	 * @param {number} swiccId - SwiCC identifier
	 * @returns {SwiCCSink|undefined} The sink instance or undefined if not connected
	 */
	getSink(swiccId) {
		return this.swiccSinks.get(swiccId);
	}

	/**
	 * Check if any SwiCC devices are connected
	 * @returns {boolean} True if at least one device is connected
	 */
	hasConnections() {
		return this.swiccSinks.size > 0;
	}

	/**
	 * Disconnect all connected SwiCC devices
	 * Useful for cleanup or reset operations
	 */
	async disconnectAll() {
		const disconnectPromises = [];

		// Create disconnect promises for all connected devices
		for (const swiccId of this.swiccSinks.keys()) {
			disconnectPromises.push(this.disconnectFromSwiCC(swiccId));
		}

		// Wait for all disconnections to complete
		try {
			await Promise.all(disconnectPromises);
			this.uiManager.logMessage('All SwiCC devices disconnected');
		} catch (error) {
			this.uiManager.logMessage(`Error during bulk disconnect: ${error.message}`);
		}
	}

	/**
	 * Get connection statistics for monitoring/debugging
	 * @returns {Object} Connection statistics
	 */
	getConnectionStats() {
		return {
			connectedCount: this.swiccSinks.size,
			connectedIds: this.getConnectedIds(),
			maxConnections: 4,
			engineRunning: this.hasConnections()
		};
	}

	/**
	 * Reconnect to a specific SwiCC (disconnect then connect)
	 * @param {number} swiccId - SwiCC identifier to reconnect
	 */
	async reconnectSwiCC(swiccId) {
		this.uiManager.logMessage(`Reconnecting SwiCC #${swiccId + 1}...`);

		try {
			// Disconnect if currently connected
			if (this.isConnected(swiccId)) {
				await this.disconnectFromSwiCC(swiccId);
				// Small delay to ensure clean disconnect
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			// Reconnect
			await this.connectToSwiCC(swiccId);

		} catch (error) {
			this.uiManager.logMessage(`Reconnection failed for SwiCC #${swiccId + 1}: ${error.message}`);
		}
	}

	/**
	 * Initialize connection UI state
	 * Sets all devices to disconnected state
	 */
	initializeUI() {
		for (let i = 0; i < 4; i++) {
			this.updateConnectionStatus(i, false);
		}

		// Initialize additional SwiCCs as hidden
		this.uiManager.toggleElement('additionalSwiCCs', false);
	}

	/**
	 * Check if Web Serial API is supported
	 * @returns {boolean} True if Web Serial is supported
	 */
	static isSerialSupported() {
		return 'serial' in navigator;
	}

	/**
	 * Get a user-friendly error message for common connection issues
	 * @param {Error} error - The error that occurred
	 * @returns {string} User-friendly error message
	 */
	getErrorMessage(error) {
		const message = error.message.toLowerCase();

		if (message.includes('user gesture')) {
			return 'Connection requires user interaction. Please try again.';
		} else if (message.includes('no port selected')) {
			return 'No device selected. Please choose a SwiCC device.';
		} else if (message.includes('access denied')) {
			return 'Access denied. Device may be in use by another application.';
		} else if (message.includes('network error')) {
			return 'Device disconnected unexpectedly. Please check connections.';
		} else {
			return error.message;
		}
	}

	/**
	 * Dispose of the connection manager and clean up resources
	 */
	async dispose() {
		try {
			await this.disconnectAll();
		} catch (error) {
			console.error('Error during ConnectionManager disposal:', error);
		}

		// Clear the sinks map
		this.swiccSinks.clear();
	}
}