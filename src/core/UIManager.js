// ./src/core/UIManager.js

/**
 * UIManager handles all DOM manipulation and UI updates
 * This is the foundation that other managers will use for UI operations
 */
export class UIManager {
	constructor() {
		this.elements = this.getElements();
		this.hideStatusTimeout = null;

		// Initialize UI state
		this.initializeButtonGrid();
		this.initializeConfigCollapse();
	}

	/**
	 * Get all DOM elements we'll need to manipulate
	 * Centralizes element selection for better maintainability
	 */
	getElements() {
		return {
			// Status elements
			serialStatus: document.getElementById('serialStatus'),
			gamepadName: document.getElementById('gamepadName'),
			messageLog: document.getElementById('messageLog'),
			connectedCount: document.getElementById('connectedCount'),
			configStatus: document.getElementById('configStatus'),

			// Gamepad display elements
			gpButtonGrid: document.getElementById('gpButtonGrid'),
			leftStick: document.getElementById('leftStick'),
			rightStick: document.getElementById('rightStick'),

			// Configuration elements
			presetSelector: document.getElementById('presetSelector'),
			configName: document.getElementById('configName'),
			configSelector: document.getElementById('configSelector'),
			configHeader: document.getElementById('configHeader'),
			configToggle: document.getElementById('configToggle'),
			configContent: document.getElementById('configContent'),

			// Broadcast elements
			broadcastEnabled: document.getElementById('broadcastEnabled'),
			innerSnapshotPosition: document.getElementById('innerSnapshotPosition'),
			outerSnapshotPosition: document.getElementById('outerSnapshotPosition'),

			// Pipeline elements
			toggleControlsBtn: document.getElementById('toggleControlsBtn'),
			toggleControlsIcon: document.getElementById('toggleControlsIcon'),
			pipelineControls: document.getElementById('pipelineControls'),
			pipelineContainer: document.getElementById('pipelineContainer'),

			// Additional SwiCCs
			addMoreSwiCCsBtn: document.getElementById('addMoreSwiCCsBtn'),
			additionalSwiCCs: document.getElementById('additionalSwiCCs'),

			// File input
			importFileInput: document.getElementById('importFileInput')
		};
	}

	/**
	 * Initialize the gamepad button grid display
	 */
	initializeButtonGrid() {
		const buttons = [
			'A', 'B', 'X', 'Y',
			'L', 'R', 'ZL', 'ZR',
			'−', '+', 'h', 'c',
			'↑', '↓', '←', '→'
		];

		this.elements.gpButtonGrid.innerHTML = buttons.map(btn =>
			`<div class="button-indicator" data-button="${btn}">${btn}</div>`
		).join('');
	}

	/**
	 * Initialize configuration panel collapse/expand functionality
	 */
	initializeConfigCollapse() {
		this.elements.configHeader.addEventListener('click', () => {
			this.toggleConfigPanel();
		});
	}

	/**
	 * Toggle configuration panel expanded/collapsed state
	 */
	toggleConfigPanel() {
		const isExpanded = this.elements.configContent.classList.contains('expanded');

		if (isExpanded) {
			// Collapse
			this.elements.configContent.classList.remove('expanded');
			this.elements.configContent.classList.add('collapsed');
			this.elements.configToggle.textContent = '▷';
			this.elements.configToggle.classList.remove('expanded');
		} else {
			// Expand
			this.elements.configContent.classList.remove('collapsed');
			this.elements.configContent.classList.add('expanded');
			this.elements.configToggle.textContent = '▽';
			this.elements.configToggle.classList.add('expanded');
		}
	}

	/**
	 * Update gamepad connection and input status
	 * @param {Object} gamepadData - Gamepad state data
	 */
	updateGamepadStatus(gamepadData) {
		if (gamepadData.connected) {
			this.elements.gamepadName.textContent = gamepadData.id;
			this.updateButtonStates(gamepadData.buttons);
			this.updateStickPositions(gamepadData.axes);
		} else {
			this.elements.gamepadName.textContent = 'No gamepad detected';
			this.clearButtonStates();
			this.clearStickPositions();
		}
	}

	/**
	 * Update button pressed states
	 * @param {Object} buttonStates - Map of button names to pressed states
	 */
	updateButtonStates(buttonStates) {
		Object.entries(buttonStates).forEach(([buttonName, pressed]) => {
			const element = this.elements.gpButtonGrid.querySelector(`[data-button="${buttonName}"]`);
			if (element) {
				element.classList.toggle('pressed', pressed);
			}
		});
	}

	/**
	 * Clear all button pressed states
	 */
	clearButtonStates() {
		this.elements.gpButtonGrid.querySelectorAll('.button-indicator').forEach(btn => {
			btn.classList.remove('pressed');
		});
	}

	/**
	 * Update analog stick positions
	 * @param {Array} axes - Array of axis values [leftX, leftY, rightX, rightY]
	 */
	updateStickPositions(axes) {
		this.elements.leftStick.textContent = `${axes[0]}, ${axes[1]}`;
		this.elements.rightStick.textContent = `${axes[2]}, ${axes[3]}`;
	}

	/**
	 * Clear stick positions to default
	 */
	clearStickPositions() {
		this.elements.leftStick.textContent = '0.00, 0.00';
		this.elements.rightStick.textContent = '0.00, 0.00';
	}

	/**
	 * Update SwiCC connection status display
	 * @param {number} swiccId - SwiCC identifier (0-3)
	 * @param {boolean} connected - Connection state
	 */
	updateSwiCCStatus(swiccId, connected) {
		const connectBtn = document.getElementById(`connectBtn${swiccId}`);
		const disconnectBtn = document.getElementById(`disconnectBtn${swiccId}`);
		const statusElement = document.getElementById(`swiccStatus${swiccId}`);

		if (connectBtn && disconnectBtn && statusElement) {
			if (connected) {
				connectBtn.disabled = true;
				disconnectBtn.disabled = false;
				statusElement.textContent = 'Connected';
				statusElement.className = 'swicc-status connected';
			} else {
				connectBtn.disabled = false;
				disconnectBtn.disabled = true;
				statusElement.textContent = 'Disconnected';
				statusElement.className = 'swicc-status disconnected';
			}
		}
	}

	/**
	 * Update the connected device count and overall status
	 * @param {number} connectedCount - Number of connected devices
	 */
	updateConnectedCount(connectedCount) {
		this.elements.connectedCount.textContent = connectedCount;

		// Update overall serial status indicator
		if (connectedCount > 0) {
			this.elements.serialStatus.classList.add('connected');
		} else {
			this.elements.serialStatus.classList.remove('connected');
		}
	}

	/**
	 * Show a status message with auto-hide
	 * @param {string} message - Message to display
	 * @param {string} type - Message type: 'info', 'success', 'error'
	 */
	showStatus(message, type = 'info') {
		this.elements.configStatus.textContent = message;
		this.elements.configStatus.className = `config-status ${type}`;
		this.elements.configStatus.style.display = '';

		// Clear any existing timeout
		if (this.hideStatusTimeout) {
			clearTimeout(this.hideStatusTimeout);
		}

		// Auto-hide after 3 seconds
		this.hideStatusTimeout = setTimeout(() => {
			this.elements.configStatus.style.display = 'none';
			this.hideStatusTimeout = null;
		}, 3000);
	}

	/**
	 * Log a message to the message log with timestamp
	 * @param {string} message - Message to log
	 */
	logMessage(message) {
		const timestamp = new Date().toLocaleTimeString();
		const messageDiv = document.createElement('div');
		messageDiv.className = 'message';
		messageDiv.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;

		this.elements.messageLog.appendChild(messageDiv);
		this.elements.messageLog.scrollTop = this.elements.messageLog.scrollHeight;

		// Keep only last 50 messages to prevent memory issues
		while (this.elements.messageLog.children.length > 50) {
			this.elements.messageLog.removeChild(this.elements.messageLog.firstChild);
		}
	}

	/**
	 * Update configuration selector with available options
	 * @param {Array} savedConfigs - Array of saved configuration names
	 */
	updateConfigSelector(savedConfigs) {
		this.elements.configSelector.innerHTML = '<option value="">Select saved configuration...</option>';

		savedConfigs.forEach(config => {
			const option = document.createElement('option');
			option.value = config.name;
			option.textContent = `${config.name} (${new Date(config.timestamp).toLocaleDateString()})`;
			this.elements.configSelector.appendChild(option);
		});

		// Enable/disable buttons based on selection
		const loadBtn = document.getElementById('loadConfigBtn');
		const deleteBtn = document.getElementById('deleteConfigBtn');

		if (loadBtn && deleteBtn) {
			loadBtn.disabled = !this.elements.configSelector.value;
			deleteBtn.disabled = !this.elements.configSelector.value;
		}
	}

	/**
	 * Populate preset selector with available presets
	 * @param {Object} presets - Object mapping preset keys to preset data
	 */
	populatePresetSelector(presets) {
		this.elements.presetSelector.innerHTML = '<option value="">Select preset...</option>';

		Object.entries(presets).forEach(([key, preset]) => {
			const option = document.createElement('option');
			option.value = key;
			option.textContent = `${preset.name} - ${preset.description}`;
			this.elements.presetSelector.appendChild(option);
		});
	}

	/**
	 * Toggle visibility of additional SwiCC connections
	 */
	toggleAdditionalSwiCCs() {
		const isVisible = this.elements.additionalSwiCCs.style.display !== 'none';
		this.elements.additionalSwiCCs.style.display = isVisible ? 'none' : 'block';
		this.elements.addMoreSwiCCsBtn.textContent = isVisible ?
			'Add More SwiCCs' : 'Hide Additional SwiCCs';
	}

	/**
	 * Toggle pipeline controls visibility
	 */
	togglePipelineControls() {
		const isVisible = this.elements.pipelineControls.style.display !== 'none';
		this.elements.pipelineControls.style.display = isVisible ? 'none' : '';
		this.elements.toggleControlsIcon.textContent = isVisible ? '▷' : '▽';
	}

	/**
	 * Clear all content from the pipeline container
	 */
	clearPipelineContainer() {
		this.elements.pipelineContainer.innerHTML = '';
	}

	/**
	 * Create a snapshot indicator element for broadcast display
	 * @param {string} type - Type of snapshot ('inner' or 'outer')
	 * @param {string} label - Display label for the indicator
	 * @returns {HTMLElement} The created indicator element
	 */
	createSnapshotIndicator(type, label) {
		const indicator = document.createElement('div');
		indicator.className = `snapshot-indicator snapshot-${type}`;
		indicator.innerHTML = `
            <div class="snapshot-label">${label}</div>
            <div class="snapshot-line"></div>
        `;
		return indicator;
	}

	/**
	 * Remove all existing snapshot indicators
	 */
	removeSnapshotIndicators() {
		document.querySelectorAll('.snapshot-indicator').forEach(el => el.remove());
	}

	/**
	 * Create a button element with specified properties
	 * @param {string} text - Button text
	 * @param {string} className - CSS class name
	 * @param {Function} clickHandler - Click event handler
	 * @returns {HTMLElement} The created button element
	 */
	createButton(text, className = 'button', clickHandler = null) {
		const button = document.createElement('button');
		button.className = className;
		button.textContent = text;

		if (clickHandler) {
			button.addEventListener('click', clickHandler);
		}

		return button;
	}

	/**
	 * Get the current value from an input element safely
	 * @param {string} elementId - ID of the input element
	 * @param {*} defaultValue - Default value if element not found or empty
	 * @returns {*} The input value or default
	 */
	getInputValue(elementId, defaultValue = '') {
		const element = document.getElementById(elementId);
		return element ? element.value : defaultValue;
	}

	/**
	 * Set the value of an input element safely
	 * @param {string} elementId - ID of the input element
	 * @param {*} value - Value to set
	 */
	setInputValue(elementId, value) {
		const element = document.getElementById(elementId);
		if (element) {
			element.value = value;
		}
	}

	/**
	 * Show/hide an element
	 * @param {string|HTMLElement} element - Element ID or element reference
	 * @param {boolean} show - Whether to show the element
	 */
	toggleElement(element, show) {
		const el = typeof element === 'string' ? document.getElementById(element) : element;
		if (el) {
			el.style.display = show ? '' : 'none';
		}
	}

	/**
	 * Add event listener to an element safely
	 * @param {string} elementId - ID of the element
	 * @param {string} event - Event type
	 * @param {Function} handler - Event handler function
	 */
	addEventListenerSafe(elementId, event, handler) {
		const element = document.getElementById(elementId);
		if (element) {
			element.addEventListener(event, handler);
		}
	}

	/**
	 * Clean up any UI resources (timers, event listeners, etc.)
	 */
	dispose() {
		if (this.hideStatusTimeout) {
			clearTimeout(this.hideStatusTimeout);
			this.hideStatusTimeout = null;
		}
	}
}