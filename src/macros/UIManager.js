/**
 * /src/macros/UIManager.js
 * 
 * Manages all UI interactions and DOM updates for the gamepad interface.
 */

export class UIManager {
	constructor() {
		this.elements = {};
		this.eventCallbacks = {};
		this.initializeElements();
		this.attachEventListeners();
	}

	/**
	 * Initialize references to all DOM elements.
	 */
	initializeElements() {
		this.elements = {
			// Connection controls
			connectBtn: document.getElementById('connectBtn'),
			disconnectBtn: document.getElementById('disconnectBtn'),

			// Playback controls
			playMacroBtn: document.getElementById('playMacroBtn'),
			stopPlaybackBtn: document.getElementById('stopPlaybackBtn'),

			// Status indicators
			swiccStatusIndicator: document.getElementById('swiccStatusIndicator'),
			gamepadStatusIndicator: document.getElementById('gamepadStatusIndicator'),
			connectionStatus: document.getElementById('connectionStatus'),
			currentStatus: document.getElementById('currentStatus'),

			// Device info
			deviceId: document.getElementById('deviceId'),
			deviceVersion: document.getElementById('deviceVersion'),
			queueSize: document.getElementById('queueSize'),
			queueRemaining: document.getElementById('queueRemaining'),
			vsyncDelay: document.getElementById('vsyncDelay'),
			useVsyncBtn: document.getElementById('useVsyncBtn'),

			// Gamepad display
			gamepadName: document.getElementById('gamepadName'),
			leftStick: document.getElementById('leftStick'),
			rightStick: document.getElementById('rightStick'),
			buttonGrid: document.getElementById('buttonGrid'),

			// Macro controls
			macroScript: document.getElementById('macroScript'),
			validateMacroBtn: document.getElementById('validateMacroBtn'),
			loadExampleBtn: document.getElementById('loadExampleBtn'),
			clearMacroBtn: document.getElementById('clearMacroBtn'),
			macroLineCount: document.getElementById('macroLineCount'),
			macroDuration: document.getElementById('macroDuration'),
			macroProgress: document.getElementById('macroProgress'),

			// Logging
			messageLog: document.getElementById('messageLog')
		};
	}

	/**
	 * Attach event listeners to UI elements.
	 */
	attachEventListeners() {
		// Connection events
		this.elements.connectBtn.addEventListener('click', () =>
			this.triggerCallback('connectSwiCC'));
		this.elements.disconnectBtn.addEventListener('click', () =>
			this.triggerCallback('disconnectSwiCC'));
		this.elements.useVsyncBtn.addEventListener('click', () =>
			this.triggerCallback('useVsync'));

		// Playback events
		this.elements.playMacroBtn.addEventListener('click', () =>
			this.triggerCallback('playMacro'));
		this.elements.stopPlaybackBtn.addEventListener('click', () =>
			this.triggerCallback('stopAllPlayback'));

		// Macro events
		this.elements.validateMacroBtn.addEventListener('click', () =>
			this.triggerCallback('validateMacro'));
		this.elements.loadExampleBtn.addEventListener('click', () =>
			this.triggerCallback('loadExample'));
		this.elements.clearMacroBtn.addEventListener('click', () =>
			this.triggerCallback('clearMacro'));
		this.elements.macroScript.addEventListener('input', () =>
			this.triggerCallback('updateMacroInfo'));
	}

	/**
	 * Register a callback for a specific event.
	 * @param {string} eventName - Name of the event
	 * @param {Function} callback - Callback function
	 */
	onEvent(eventName, callback) {
		this.eventCallbacks[eventName] = callback;
	}

	/**
	 * Trigger a registered callback.
	 * @param {string} eventName - Name of the event to trigger
	 * @param {...any} args - Arguments to pass to the callback
	 */
	triggerCallback(eventName, ...args) {
		if (this.eventCallbacks[eventName]) {
			this.eventCallbacks[eventName](...args);
		}
	}

	/**
	 * Initialize the button grid display.
	 */
	initializeButtonGrid() {
		const buttonNames = [
			'Y', 'X', 'B', 'A',
			'L', 'R', 'ZL', 'ZR',
			'-', '+', 'LS', 'RS',
			'↑', '↓', '←', '→',
			'H', 'C', 'SL', 'SR'
		];

		buttonNames.forEach(name => {
			const button = document.createElement('div');
			button.className = 'button-indicator';
			button.textContent = name;
			button.id = `btn-${name}`;
			this.elements.buttonGrid.appendChild(button);
		});
	}

	/**
	 * Get the current VSYNC delay value.
	 * @returns {number} The VSYNC delay in microseconds
	 */
	getVsyncDelay() {
		return parseInt(this.elements.vsyncDelay.value) || 10000;
	}
	
	/**
	 * Update the SwiCC connection status display.
	 * @param {boolean} connected - Whether SwiCC is connected
	 */
	updateSwiCCStatus(connected) {
		this.elements.swiccStatusIndicator.classList.toggle('connected', connected);
		this.elements.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
		this.elements.connectionStatus.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;

		this.elements.connectBtn.disabled = connected;
		this.elements.disconnectBtn.disabled = !connected;

		this.elements.useVsyncBtn.disabled = !connected;
		
		if (!connected) {
			this.updateDeviceInfo('-', '-', '-', '-');
		}
	}

	/**
	 * Update device information display.
	 * @param {string} deviceId - Device ID
	 * @param {string} version - Device version
	 * @param {string|number} queueSize - Queue size
	 * @param {string|number} queueRemaining - Queue remaining
	 */
	updateDeviceInfo(deviceId, version, queueSize, queueRemaining) {
		this.elements.deviceId.textContent = deviceId;
		this.elements.deviceVersion.textContent = version;
		this.elements.queueSize.textContent = queueSize;
		this.elements.queueRemaining.textContent = queueRemaining;
	}

	/**
	 * Update the gamepad status display.
	 * @param {boolean} connected - Whether gamepad is connected
	 */
	updateGamepadStatus(connected) {
		this.elements.gamepadStatusIndicator.classList.toggle('connected', connected);
		if (!connected) {
			this.elements.gamepadName.textContent = 'No gamepad detected';
			this.elements.leftStick.textContent = 'Left: X: 0.00, Y: 0.00';
			this.elements.rightStick.textContent = 'Right: X: 0.00, Y: 0.00';
		}
	}

	/**
	 * Update the gamepad display with current state.
	 * @param {ControllerState} state - Current controller state
	 * @param {string} gamepadName - Name of the gamepad
	 */
	updateGamepadDisplay(state, gamepadName) {
		if (!state) return;

		// Update gamepad name
		if (gamepadName) {
			this.elements.gamepadName.textContent = gamepadName;
		}

		// Update analog sticks
		this.elements.leftStick.textContent =
			`Left: X: ${state.analog.leftX.toFixed(2)}, Y: ${state.analog.leftY.toFixed(2)}`;
		this.elements.rightStick.textContent =
			`Right: X: ${state.analog.rightX.toFixed(2)}, Y: ${state.analog.rightY.toFixed(2)}`;

		// Update button indicators
		const buttonMap = {
			'Y': state.digital.buttonY,
			'X': state.digital.buttonX,
			'B': state.digital.buttonB,
			'A': state.digital.buttonA,
			'L': state.digital.buttonL,
			'R': state.digital.buttonR,
			'ZL': state.digital.buttonZL,
			'ZR': state.digital.buttonZR,
			'-': state.digital.buttonMinus,
			'+': state.digital.buttonPlus,
			'LS': state.digital.buttonThumbL,
			'RS': state.digital.buttonThumbR,
			'↑': state.digital.dpadUp,
			'↓': state.digital.dpadDown,
			'←': state.digital.dpadLeft,
			'→': state.digital.dpadRight,
			'H': state.digital.buttonHome,
			'C': state.digital.buttonCapture,
			'SL': state.digital.buttonLeftSL || state.digital.buttonRightSL,
			'SR': state.digital.buttonLeftSR || state.digital.buttonRightSR
		};

		Object.entries(buttonMap).forEach(([name, pressed]) => {
			const element = document.getElementById(`btn-${name}`);
			if (element) {
				element.classList.toggle('pressed', pressed);
			}
		});
	}

	/**
	 * Update the current status display.
	 * @param {string} status - Current status text
	 */
	updateStatus(status) {
		this.elements.currentStatus.textContent = status;
	}

	/**
	 * Update macro progress display.
	 * @param {number} current - Current frame index
	 * @param {number} total - Total frames
	 */
	updateMacroProgress(current, total) {
		if (total === 0) {
			this.elements.macroProgress.textContent = '-';
		} else {
			this.elements.macroProgress.textContent = `${current} / ${total}`;
		}
	}

	/**
	 * Set macro progress to complete.
	 */
	setMacroProgressComplete() {
		this.elements.macroProgress.textContent = 'Complete';
	}

	/**
	 * Update macro information display.
	 * @param {number} lineCount - Number of lines in macro
	 * @param {number} duration - Duration in seconds
	 */
	updateMacroInfo(lineCount, duration) {
		this.elements.macroLineCount.textContent = lineCount;
		this.elements.macroDuration.textContent = `${duration.toFixed(1)}s`;
	}

	/**
	 * Update playback button states.
	 * @param {Object} state - Button state object
	 * @param {boolean} state.isConnected - Whether SwiCC is connected
	 * @param {boolean} state.gamepadPassthroughActive - Whether gamepad passthrough is active
	 * @param {boolean} state.macroPlaybackActive - Whether macro playback is active
	 * @param {boolean} state.hasMacroScript - Whether there's a valid macro script
	 */
	updatePlaybackButtons(state) {
		const anyPlaybackActive = state.gamepadPassthroughActive || state.macroPlaybackActive;

		this.elements.playMacroBtn.disabled = !state.isConnected || !state.hasMacroScript || state.macroPlaybackActive;
		this.elements.stopPlaybackBtn.disabled = !anyPlaybackActive;
	}

	/**
	 * Get the current macro script text.
	 * @returns {string} The macro script text
	 */
	getMacroScript() {
		return this.elements.macroScript.value;
	}

	/**
	 * Set the macro script text.
	 * @param {string} script - The macro script text
	 */
	setMacroScript(script) {
		this.elements.macroScript.value = script;
	}

	/**
	 * Clear the macro script.
	 */
	clearMacroScript() {
		this.elements.macroScript.value = '';
	}

	/**
	 * Log a message to the message display.
	 * @param {string} message - Message to log
	 * @param {string} type - Message type (info, error, warning, success)
	 */
	logMessage(message, type = 'info') {
		const timestamp = new Date().toLocaleTimeString();
		const messageElement = document.createElement('div');
		messageElement.className = `message ${type}`;
		messageElement.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;

		this.elements.messageLog.appendChild(messageElement);
		this.elements.messageLog.scrollTop = this.elements.messageLog.scrollHeight;

		// Keep only last 100 messages
		while (this.elements.messageLog.children.length > 100) {
			this.elements.messageLog.removeChild(this.elements.messageLog.firstChild);
		}
	}
}