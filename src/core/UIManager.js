// ./src/core/UIManager.js

/**
 * UIManager handles all DOM manipulation and UI updates
 * This is the foundation that other managers will use for UI operations
 */
export class UIManager {
	constructor() {
		this.messagesEnabled = true;
		this.elements = this.getElements();
		this.elements.messagesEnabled.addEventListener('change', () => {
			this.messagesEnabled = this.elements.messagesEnabled.checked;
		});
		this.hideStatusTimeout = null;

		// Initialize UI state
		this.initializeButtonGrid();
		this.initializeConfigCollapse();
	}

	/**
	 * Turn on or off system messages
	 */
	setEnabled(enable) {
		this.messagesEnabled = enable;
	}

	/**
	 * Get all DOM elements we'll need to manipulate
	 * Centralizes element selection for better maintainability
	 */
	getElements() {
		return {
			// System messages elements
			messagesEnabled: document.getElementById('messagesEnabled'),

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

			// External control elements
			browserMessagingStatus: document.getElementById('browserMessagingStatus'),
			websocketStatus: document.getElementById('websocketStatus'),
			externalControlStats: document.getElementById('externalControlStats'),
			roomNameInput: document.getElementById('roomNameInput'),
			connectExternalBtn: document.getElementById('connectExternalBtn'),
			disconnectExternalBtn: document.getElementById('disconnectExternalBtn'),

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
				statusElement.className = 'connection-status connected';
			} else {
				connectBtn.disabled = false;
				disconnectBtn.disabled = true;
				statusElement.textContent = 'Disconnected';
				statusElement.className = 'connection-status disconnected';
			}
		}
	}

	/**
	 * Update external control connection status
	 * @param {string} type - Connection type ('browser' or 'websocket')
	 * @param {boolean} connected - Connection state
	 */
	updateExternalControlStatus(type, connected) {
		let statusElement;

		if (type === 'browser') {
			statusElement = this.elements.browserMessagingStatus;
		} else if (type === 'websocket') {
			statusElement = this.elements.websocketStatus;
		}

		if (statusElement) {
			statusElement.textContent = connected ? 'Connected' : 'Disconnected';
			statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
		}
	}

	/**
	 * Update external control statistics display
	 * @param {Object} stats - Statistics object
	 */
	updateExternalControlStats(stats) {
		if (!this.elements.externalControlStats) return;

		const lastMessageDisplay = stats.lastMessage ?
			JSON.stringify(stats.lastMessage).substring(0, 50) + '...' : 'None';

		this.elements.externalControlStats.innerHTML = `
			<div class="stat-item">
				<span class="stat-label">Messages Received:</span>
				<span class="stat-value">${stats.received}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Messages Processed:</span>
				<span class="stat-value">${stats.processed}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Errors:</span>
				<span class="stat-value">${stats.errors}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Last Message:</span>
				<span class="stat-value">${lastMessageDisplay}</span>
			</div>
		`;
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
		if (!this.messagesEnabled) return;

		const timestamp = new Date().toLocaleTimeString();
		const messageDiv = document.createElement('div');
		messageDiv.className = 'message';
		messageDiv.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;

		this.elements.messageLog.appendChild(messageDiv);
		// Keep only last 50 messages to prevent memory issues
		while (this.elements.messageLog.children.length > 50) {
			this.elements.messageLog.removeChild(this.elements.messageLog.firstChild);
		}
		this.elements.messageLog.scrollTop = this.elements.messageLog.scrollHeight;
	}

	/**
	 * Update configuration selector with available options
	 * @param {Array} savedConfigs - Array of saved configuration names
	 */
	updateConfigSelector(savedConfigs) {
		this.elements.configSelector.innerHTML = '<option value="">Select saved configuration...</option>';

		// Find the most recent configuration (regardless of name)
		const mostRecentConfig = savedConfigs.length > 0
			? savedConfigs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
			: null;

		let selectedValue = '';

		savedConfigs.forEach(config => {
			const option = document.createElement('option');
			option.value = config.name;
			option.textContent = `${config.name} (${new Date(config.timestamp).toLocaleDateString()})`;

			// Select the most recent configuration
			if (mostRecentConfig && config.name === mostRecentConfig.name) {
				option.selected = true;
				selectedValue = config.name;
			}

			this.elements.configSelector.appendChild(option);
		});

		// Update the selector's value to reflect the selection
		if (selectedValue) {
			this.elements.configSelector.value = selectedValue;
		}

		// Enable/disable buttons based on selection
		const loadBtn = document.getElementById('loadConfigBtn');
		const deleteBtn = document.getElementById('deleteConfigBtn');

		if (loadBtn && deleteBtn) {
			const hasSelection = !!this.elements.configSelector.value;
			loadBtn.disabled = !hasSelection;
			deleteBtn.disabled = !hasSelection;
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
	 * Enable or disable an element
	 * @param {string} elementId - ID of the element
	 * @param {boolean} enabled - Whether to enable the element
	 */
	setElementEnabled(elementId, enabled) {
		const element = document.getElementById(elementId);
		if (element) {
			element.disabled = !enabled;
		}
	}

	/**
	 * Set checkbox state
	 * @param {string} elementId - ID of the checkbox element
	 * @param {boolean} checked - Whether to check the checkbox
	 */
	setCheckboxState(elementId, checked) {
		const element = document.getElementById(elementId);
		if (element && element.type === 'checkbox') {
			element.checked = checked;
		}
	}

	/**
	 * Get checkbox state
	 * @param {string} elementId - ID of the checkbox element
	 * @returns {boolean} Checkbox state
	 */
	getCheckboxState(elementId) {
		const element = document.getElementById(elementId);
		return element && element.type === 'checkbox' ? element.checked : false;
	}

	/**
	 * Update element text content safely
	 * @param {string} elementId - ID of the element
	 * @param {string} text - Text to set
	 */
	setElementText(elementId, text) {
		const element = document.getElementById(elementId);
		if (element) {
			element.textContent = text;
		}
	}

	/**
	 * Update element HTML content safely
	 * @param {string} elementId - ID of the element
	 * @param {string} html - HTML to set
	 */
	setElementHTML(elementId, html) {
		const element = document.getElementById(elementId);
		if (element) {
			element.innerHTML = html;
		}
	}

	/**
	 * Add CSS class to an element
	 * @param {string} elementId - ID of the element
	 * @param {string} className - Class name to add
	 */
	addElementClass(elementId, className) {
		const element = document.getElementById(elementId);
		if (element) {
			element.classList.add(className);
		}
	}

	/**
	 * Remove CSS class from an element
	 * @param {string} elementId - ID of the element
	 * @param {string} className - Class name to remove
	 */
	removeElementClass(elementId, className) {
		const element = document.getElementById(elementId);
		if (element) {
			element.classList.remove(className);
		}
	}

	/**
	 * Toggle CSS class on an element
	 * @param {string} elementId - ID of the element
	 * @param {string} className - Class name to toggle
	 * @param {boolean} force - Force add (true) or remove (false), undefined for toggle
	 */
	toggleElementClass(elementId, className, force) {
		const element = document.getElementById(elementId);
		if (element) {
			element.classList.toggle(className, force);
		}
	}

	/**
	 * Show an element with optional animation
	 * @param {string} elementId - ID of the element to show
	 * @param {string} displayType - Display type to use (default: 'block')
	 */
	showElement(elementId, displayType = 'block') {
		const element = document.getElementById(elementId);
		if (element) {
			element.style.display = displayType;
		}
	}

	/**
	 * Hide an element
	 * @param {string} elementId - ID of the element to hide
	 */
	hideElement(elementId) {
		const element = document.getElementById(elementId);
		if (element) {
			element.style.display = 'none';
		}
	}

	/**
	 * Check if an element exists
	 * @param {string} elementId - ID of the element
	 * @returns {boolean} True if element exists
	 */
	elementExists(elementId) {
		return document.getElementById(elementId) !== null;
	}

	/**
	 * Focus on an element
	 * @param {string} elementId - ID of the element to focus
	 */
	focusElement(elementId) {
		const element = document.getElementById(elementId);
		if (element && element.focus) {
			element.focus();
		}
	}

	/**
	 * Scroll element into view
	 * @param {string} elementId - ID of the element
	 * @param {Object} options - Scroll options
	 */
	scrollElementIntoView(elementId, options = { behavior: 'smooth' }) {
		const element = document.getElementById(elementId);
		if (element && element.scrollIntoView) {
			element.scrollIntoView(options);
		}
	}

	/**
	 * Create and append a child element
	 * @param {string} parentId - ID of the parent element
	 * @param {string} tagName - Tag name for the new element
	 * @param {Object} options - Options for the new element
	 * @returns {HTMLElement|null} The created element or null
	 */
	appendChild(parentId, tagName, options = {}) {
		const parent = document.getElementById(parentId);
		if (!parent) return null;

		const element = document.createElement(tagName);

		if (options.className) element.className = options.className;
		if (options.id) element.id = options.id;
		if (options.textContent) element.textContent = options.textContent;
		if (options.innerHTML) element.innerHTML = options.innerHTML;

		parent.appendChild(element);
		return element;
	}

	/**
	 * Remove all children from an element
	 * @param {string} elementId - ID of the element to clear
	 */
	clearElement(elementId) {
		const element = document.getElementById(elementId);
		if (element) {
			element.innerHTML = '';
		}
	}

	/**
	 * Get element dimensions
	 * @param {string} elementId - ID of the element
	 * @returns {Object} Object with width and height properties
	 */
	getElementDimensions(elementId) {
		const element = document.getElementById(elementId);
		if (element) {
			const rect = element.getBoundingClientRect();
			return {
				width: rect.width,
				height: rect.height,
				x: rect.x,
				y: rect.y
			};
		}
		return { width: 0, height: 0, x: 0, y: 0 };
	}

	/**
	 * Set element style property
	 * @param {string} elementId - ID of the element
	 * @param {string} property - CSS property name
	 * @param {string} value - CSS property value
	 */
	setElementStyle(elementId, property, value) {
		const element = document.getElementById(elementId);
		if (element) {
			element.style[property] = value;
		}
	}

	/**
	 * Get element style property
	 * @param {string} elementId - ID of the element
	 * @param {string} property - CSS property name
	 * @returns {string} CSS property value
	 */
	getElementStyle(elementId, property) {
		const element = document.getElementById(elementId);
		if (element) {
			return getComputedStyle(element)[property];
		}
		return '';
	}

	/**
	 * Create a tooltip for an element
	 * @param {string} elementId - ID of the element
	 * @param {string} tooltipText - Tooltip text
	 */
	addTooltip(elementId, tooltipText) {
		const element = document.getElementById(elementId);
		if (element) {
			element.title = tooltipText;
		}
	}

	/**
	 * Remove tooltip from an element
	 * @param {string} elementId - ID of the element
	 */
	removeTooltip(elementId) {
		const element = document.getElementById(elementId);
		if (element) {
			element.removeAttribute('title');
		}
	}

	/**
	 * Set element attribute
	 * @param {string} elementId - ID of the element
	 * @param {string} attribute - Attribute name
	 * @param {string} value - Attribute value
	 */
	setElementAttribute(elementId, attribute, value) {
		const element = document.getElementById(elementId);
		if (element) {
			element.setAttribute(attribute, value);
		}
	}

	/**
	 * Get element attribute
	 * @param {string} elementId - ID of the element
	 * @param {string} attribute - Attribute name
	 * @returns {string|null} Attribute value
	 */
	getElementAttribute(elementId, attribute) {
		const element = document.getElementById(elementId);
		if (element) {
			return element.getAttribute(attribute);
		}
		return null;
	}

	/**
	 * Remove element attribute
	 * @param {string} elementId - ID of the element
	 * @param {string} attribute - Attribute name
	 */
	removeElementAttribute(elementId, attribute) {
		const element = document.getElementById(elementId);
		if (element) {
			element.removeAttribute(attribute);
		}
	}

	/**
	 * Update progress bar value
	 * @param {string} elementId - ID of the progress element
	 * @param {number} value - Progress value (0-100)
	 * @param {string} text - Optional text to display
	 */
	updateProgressBar(elementId, value, text = '') {
		const element = document.getElementById(elementId);
		if (element) {
			if (element.tagName === 'PROGRESS') {
				element.value = value;
			} else {
				// Assume it's a div-based progress bar
				const progressBar = element.querySelector('.progress-fill');
				if (progressBar) {
					progressBar.style.width = `${value}%`;
				}
			}

			if (text) {
				const textElement = element.querySelector('.progress-text');
				if (textElement) {
					textElement.textContent = text;
				}
			}
		}
	}

	/**
	 * Show loading indicator
	 * @param {string} elementId - ID of the container element
	 * @param {string} message - Loading message
	 */
	showLoadingIndicator(elementId, message = 'Loading...') {
		const element = document.getElementById(elementId);
		if (element) {
			element.innerHTML = `
				<div class="loading-indicator">
					<div class="loading-spinner"></div>
					<div class="loading-message">${message}</div>
				</div>
			`;
		}
	}

	/**
	 * Hide loading indicator
	 * @param {string} elementId - ID of the container element
	 */
	hideLoadingIndicator(elementId) {
		const element = document.getElementById(elementId);
		if (element) {
			const loadingIndicator = element.querySelector('.loading-indicator');
			if (loadingIndicator) {
				loadingIndicator.remove();
			}
		}
	}

	/**
	 * Create and show a modal dialog
	 * @param {Object} options - Modal options
	 * @returns {HTMLElement} Modal element
	 */
	showModal(options = {}) {
		const modal = document.createElement('div');
		modal.className = 'modal-overlay';
		modal.innerHTML = `
			<div class="modal-content">
				<div class="modal-header">
					<h3 class="modal-title">${options.title || 'Dialog'}</h3>
					<button class="modal-close">&times;</button>
				</div>
				<div class="modal-body">
					${options.content || ''}
				</div>
				<div class="modal-footer">
					${options.footer || '<button class="button modal-ok">OK</button>'}
				</div>
			</div>
		`;

		// Add event listeners
		const closeBtn = modal.querySelector('.modal-close');
		const okBtn = modal.querySelector('.modal-ok');

		const closeModal = () => {
			document.body.removeChild(modal);
			if (options.onClose) options.onClose();
		};

		if (closeBtn) closeBtn.addEventListener('click', closeModal);
		if (okBtn) okBtn.addEventListener('click', closeModal);

		// Close on overlay click
		modal.addEventListener('click', (e) => {
			if (e.target === modal) closeModal();
		});

		document.body.appendChild(modal);
		return modal;
	}

	/**
	 * Show confirmation dialog
	 * @param {string} message - Confirmation message
	 * @param {Function} onConfirm - Callback for confirm action
	 * @param {Function} onCancel - Callback for cancel action
	 */
	showConfirmDialog(message, onConfirm, onCancel) {
		const modal = this.showModal({
			title: 'Confirmation',
			content: `<p>${message}</p>`,
			footer: `
				<button class="button confirm-yes">Yes</button>
				<button class="button confirm-no">No</button>
			`,
			onClose: onCancel
		});

		const yesBtn = modal.querySelector('.confirm-yes');
		const noBtn = modal.querySelector('.confirm-no');

		if (yesBtn) {
			yesBtn.addEventListener('click', () => {
				document.body.removeChild(modal);
				if (onConfirm) onConfirm();
			});
		}

		if (noBtn) {
			noBtn.addEventListener('click', () => {
				document.body.removeChild(modal);
				if (onCancel) onCancel();
			});
		}
	}

	/**
	 * Show notification toast
	 * @param {string} message - Notification message
	 * @param {string} type - Notification type ('info', 'success', 'warning', 'error')
	 * @param {number} duration - Duration in milliseconds (0 for persistent)
	 */
	showNotification(message, type = 'info', duration = 3000) {
		const notification = document.createElement('div');
		notification.className = `notification notification-${type}`;
		notification.innerHTML = `
			<div class="notification-content">
				<span class="notification-message">${message}</span>
				<button class="notification-close">&times;</button>
			</div>
		`;

		// Position the notification
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			z-index: 10000;
			max-width: 300px;
		`;

		const closeBtn = notification.querySelector('.notification-close');
		const removeNotification = () => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		};

		if (closeBtn) {
			closeBtn.addEventListener('click', removeNotification);
		}

		document.body.appendChild(notification);

		// Auto-remove after duration
		if (duration > 0) {
			setTimeout(removeNotification, duration);
		}

		return notification;
	}

	/**
	 * Create a collapsible section
	 * @param {string} containerId - ID of the container element
	 * @param {string} title - Section title
	 * @param {string} content - Section content
	 * @param {boolean} expanded - Initial expanded state
	 */
	createCollapsibleSection(containerId, title, content, expanded = false) {
		const container = document.getElementById(containerId);
		if (!container) return;

		const section = document.createElement('div');
		section.className = 'collapsible-section';
		section.innerHTML = `
			<div class="collapsible-header">
				<span class="collapsible-toggle">${expanded ? '▽' : '▷'}</span>
				<span class="collapsible-title">${title}</span>
			</div>
			<div class="collapsible-content" style="display: ${expanded ? 'block' : 'none'}">
				${content}
			</div>
		`;

		const header = section.querySelector('.collapsible-header');
		const toggle = section.querySelector('.collapsible-toggle');
		const contentEl = section.querySelector('.collapsible-content');

		header.addEventListener('click', () => {
			const isExpanded = contentEl.style.display !== 'none';
			contentEl.style.display = isExpanded ? 'none' : 'block';
			toggle.textContent = isExpanded ? '▷' : '▽';
		});

		container.appendChild(section);
		return section;
	}

	/**
	 * Format bytes to human readable string
	 * @param {number} bytes - Number of bytes
	 * @returns {string} Formatted string
	 */
	formatBytes(bytes) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	/**
	 * Format timestamp to readable string
	 * @param {number|Date} timestamp - Timestamp to format
	 * @returns {string} Formatted timestamp
	 */
	formatTimestamp(timestamp) {
		const date = new Date(timestamp);
		return date.toLocaleString();
	}

	/**
	 * Debounce function calls
	 * @param {Function} func - Function to debounce
	 * @param {number} wait - Wait time in milliseconds
	 * @returns {Function} Debounced function
	 */
	debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	/**
	 * Throttle function calls
	 * @param {Function} func - Function to throttle
	 * @param {number} limit - Time limit in milliseconds
	 * @returns {Function} Throttled function
	 */
	throttle(func, limit) {
		let inThrottle;
		return function (...args) {
			if (!inThrottle) {
				func.apply(this, args);
				inThrottle = true;
				setTimeout(() => inThrottle = false, limit);
			}
		};
	}

	/**
	 * Clean up any UI resources (timers, event listeners, etc.)
	 */
	dispose() {
		if (this.hideStatusTimeout) {
			clearTimeout(this.hideStatusTimeout);
			this.hideStatusTimeout = null;
		}

		// Remove any notifications
		document.querySelectorAll('.notification').forEach(el => el.remove());

		// Remove any modals
		document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

		// Clear element references
		this.elements = {};
	}
}