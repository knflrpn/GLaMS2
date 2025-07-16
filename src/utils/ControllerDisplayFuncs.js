/**
 * /utils/ControllerDisplayFuncs.js
 * 
 * Essential message receiving functionality for the SwiCC controller display
 */

class ControllerDisplay {
	constructor(channelName = 'swicc-controller') {
		this.channelName = channelName;
		this.channel = new BroadcastChannel(channelName);
		this.isConnected = false;
		this.lastUpdate = 0;
		this.messageCount = 0;
		this.activeSources = new Set();
		this.currentData = {};

		this.setupEventListeners();
		this.startMonitoring();

		console.log(`Controller display initialized on channel: ${channelName}`);
	}

	setupEventListeners() {
		this.channel.onmessage = (event) => {
			this.handleMessage(event.data);
		};
	}

	handleMessage(message) {
		const now = Date.now();
		this.messageCount++;

		console.log('Received message:', message);

		if (message.type === 'controller-state') {
			this.handleControllerState(message);
			this.updateConnectionStatus(true);
			this.lastUpdate = now;
		} else if (message.type === 'control') {
			this.handleControlMessage(message);
		}
	}

	handleControllerState(message) {
		// Store the state data with its type
		this.currentData[message.dataType] = message.state;

		// Track this data type as active
		this.activeSources.add(message.dataType);

		console.log(`Updated ${message.dataType} state:`, message.state);

		// Call update handler if it exists
		if (typeof this.onStateUpdate === 'function') {
			this.onStateUpdate(message.dataType, message.state, this.currentData);
		}
	}

	handleControlMessage(message) {
		const { subType, dataType } = message;

		console.log('Control message:', subType, dataType);

		switch (subType) {
			case 'manipulator-attached':
				console.log(`Broadcaster attached: ${dataType}`);
				break;
			case 'manipulator-detached':
				this.activeSources.delete(dataType);
				delete this.currentData[dataType];
				console.log(`Broadcaster detached: ${dataType}`);
				break;
		}

		// Call control handler if it exists
		if (typeof this.onControlMessage === 'function') {
			this.onControlMessage(subType, dataType);
		}
	}

	updateConnectionStatus(connected) {
		this.isConnected = connected;

		console.log(`Connection status: ${connected ? 'Connected' : 'Disconnected'}`);

		// Call connection handler if it exists
		if (typeof this.onConnectionChange === 'function') {
			this.onConnectionChange(connected);
		}
	}

	startMonitoring() {
		// Update connection status and stats every second
		setInterval(() => {
			const timeSinceLastUpdate = Date.now() - this.lastUpdate;

			// Check connection timeout (3 seconds - shorter since we get messages at 60fps)
			if (timeSinceLastUpdate > 3000 && this.isConnected) {
				this.updateConnectionStatus(false);
				// Clear active sources when disconnected
				this.activeSources.clear();
			}

			// Call stats handler if it exists
			if (typeof this.onStatsUpdate === 'function') {
				this.onStatsUpdate({
					messageRate: this.messageCount,
					timeSinceLastUpdate,
					activeSources: Array.from(this.activeSources),
					isConnected: this.isConnected
				});
			}

			// Reset message counter
			this.messageCount = 0;
		}, 1000);
	}

	// Public API methods

	/**
	 * Get the current state for a specific data type
	 */
	getState(dataType) {
		return this.currentData[dataType];
	}

	/**
	 * Get all current states
	 */
	getAllStates() {
		return { ...this.currentData };
	}

	/**
	 * Get connection info
	 */
	getConnectionInfo() {
		return {
			isConnected: this.isConnected,
			channelName: this.channelName,
			activeSources: Array.from(this.activeSources),
			lastUpdate: this.lastUpdate,
			timeSinceLastUpdate: Date.now() - this.lastUpdate
		};
	}

	/**
	 * Change the broadcast channel
	 */
	setChannel(newChannelName) {
		this.channel.close();
		this.channelName = newChannelName;
		this.channel = new BroadcastChannel(newChannelName);
		this.setupEventListeners();
		console.log(`Switched to channel: ${newChannelName}`);
	}

	/**
	 * Clean up resources
	 */
	dispose() {
		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}
		console.log('Controller display disposed');
	}
}

// Initialize when page loads
let controllerDisplay = null;

document.addEventListener('DOMContentLoaded', () => {
	controllerDisplay = new ControllerDisplay();

	// Set up event handlers for your UI
	controllerDisplay.onStateUpdate = (dataType, state, allStates) => {
		console.log(`State update for ${dataType}:`, state);
		// TODO: Update your visual display here
	};

	controllerDisplay.onConnectionChange = (connected) => {
		console.log(`Connection ${connected ? 'established' : 'lost'}`);
		// TODO: Update connection indicator in your UI
	};

	controllerDisplay.onStatsUpdate = (stats) => {
		console.log('Stats:', stats);
		// TODO: Update stats display in your UI
	};

	controllerDisplay.onControlMessage = (subType, dataType) => {
		// TODO: Handle control messages if needed
	};

	// Make it globally available for debugging
	window.controllerDisplay = controllerDisplay;
});

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
	module.exports = ControllerDisplay;
}