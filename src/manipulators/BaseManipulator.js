/**
 * ./src/manipulators/BaseManipulator.js
 *
 * Base class for all input manipulators.
 * Manipulators transform ControllerState objects in a pipeline.
 */

/**
 * @typedef {Object} ManipulatorParams
 * @property {boolean} [enabled=true] - Whether this manipulator is active
 */

/**
 * @typedef {Object} ManipulatorAction
 * @property {string} name - Action identifier
 * @property {string} displayName - Human-readable name
 * @property {string} [description] - Description of what the action does
 * @property {Array<{name: string, type: string, description?: string, required?: boolean, default?: any}>} [parameters] - Parameter definitions
 * @property {Function} handler - Function that executes the action
 */

/**
 * Base class that all manipulators should extend.
 * Provides common functionality like enable/disable, naming, UI creation, actions, etc.
 */
export class BaseManipulator {
	/**
	 * Get the default configuration for this manipulator type.
	 * Subclasses should override this.
	 * @returns {Object}
	 */
	static get defaultConfig() {
		return {};
	}

	/**
	 * Return the display name for this class.
	 * Subclasses should override this
	 * @returns {String}
	 */
	static get displayName() {
		return "No name";
	}

	/**
	 * Return a brief description for this class.
	 * Subclasses should override this
	 * @returns {String}
	 */
	static get description() {
		return "No description available.";
	}

	/**
	 * Return minimum SwiCC requirements to use this manipulator.
	 * Subclasses can override this if they use features introduced 
	 * in later hardware versions.
	 * @returns {Object}
	 */
	static get requiredSwiCC() {
		return {
			type: "any", // SwiCC or 2wiCC
			firmware: "0.0",
		};
	}

	/**
	 * @param {ManipulatorParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		this.fullTitle = this.constructor.displayName + " new";
		this.enabled = params.enabled ?? true;

		// Store the original params for serialization
		this._params = { ...params };
		delete this._params.enabled; // Don't store enabled state in params

		// UI references
		this._container = null;
		this._enableCheckbox = null;
		this._titleSpan = null;

		// External logger
		this.logger = null;

		// Action registry
		this._actions = new Map();

		// Register base actions that all manipulators have
		this._registerBaseActions();
	}

	/**
	 * Register the standard actions available on all manipulators
	 */
	_registerBaseActions() {
		this.registerAction({
			name: 'enable',
			displayName: 'Enable',
			description: 'Enable this manipulator',
			handler: () => this.enable()
		});

		this.registerAction({
			name: 'disable',
			displayName: 'Disable',
			description: 'Disable this manipulator',
			handler: () => this.disable()
		});

		this.registerAction({
			name: 'toggle',
			displayName: 'Toggle',
			description: 'Toggle the enabled state',
			handler: () => this.toggle()
		});

		this.registerAction({
			name: 'setTitle',
			displayName: 'Set Name',
			description: 'Change the display name',
			parameters: [
				{ name: 'name', type: 'string', description: 'New display name', required: true }
			],
			handler: (params) => this.setTitle(params.name)
		});

		this.registerAction({
			name: 'getConfig',
			displayName: 'Get Configuration',
			description: 'Get the current configuration',
			handler: () => this.getConfig()
		});

		this.registerAction({
			name: 'setConfig',
			displayName: 'Set Configuration',
			description: 'Update the configuration',
			parameters: [
				{ name: 'config', type: 'object', description: 'Configuration object', required: true }
			],
			handler: (params) => this.setConfig(params.config)
		});

		this.registerAction({
			name: 'resetConfig',
			displayName: 'Reset to Defaults',
			description: 'Reset this manipulator to its default configuration',
			handler: () => this.resetConfig()
		});
	}

	/**
	 * Register an action that can be performed on this manipulator
	 * @param {ManipulatorAction} action
	 */
	registerAction(action) {
		if (!action.name || typeof action.handler !== 'function') {
			throw new Error('Action must have a name and handler function');
		}

		this._actions.set(action.name, {
			displayName: action.displayName || action.name,
			description: action.description || '',
			parameters: action.parameters || [],
			handler: action.handler.bind(this)
		});
	}

	/**
	 * Unregister an action
	 * @param {string} actionName
	 */
	unregisterAction(actionName) {
		// Don't allow removal of base actions
		const baseActions = ['enable', 'disable', 'toggle', 'setTitle', 'getConfig', 'setConfig'];
		if (baseActions.includes(actionName)) {
			throw new Error(`Cannot unregister base action: ${actionName}`);
		}

		this._actions.delete(actionName);
	}

	/**
	 * Get all registered actions
	 * @returns {Map<string, ManipulatorAction>}
	 */
	getActions() {
		return new Map(this._actions);
	}

	/**
	 * Get a specific action by name
	 * @param {string} actionName
	 * @returns {ManipulatorAction|undefined}
	 */
	getAction(actionName) {
		return this._actions.get(actionName);
	}

	/**
	 * Execute an action
	 * @param {string} actionName
	 * @param {Object} [params={}] - Parameters for the action
	 * @returns {any} - Result of the action
	 */
	executeAction(actionName, params = {}) {
		const action = this._actions.get(actionName);
		if (!action) {
			throw new Error(`Unknown action: ${actionName}`);
		}

		// Validate required parameters
		if (action.parameters) {
			for (const paramDef of action.parameters) {
				if (paramDef.required && !(paramDef.name in params)) {
					throw new Error(`Missing required parameter: ${paramDef.name}`);
				}

				// Apply defaults
				if (!(paramDef.name in params) && 'default' in paramDef) {
					params[paramDef.name] = paramDef.default;
				}
			}
		}

		// Execute the action
		try {
			return action.handler(params);
		} catch (error) {
			this.log(`Error executing action ${actionName}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Transform a ControllerState. Subclasses must implement this.
	 * Should return a new ControllerState or modify the existing one.
	 * 
	 * @param {import('../core/ControllerState.js').ControllerState} state
	 * @param {number} deltaTime - Time since last frame in milliseconds
	 * @returns {import('../core/ControllerState.js').ControllerState}
	 */
	process(state, deltaTime) {
		if (!this.enabled) {
			return state;
		}
		return this._processInternal(state, deltaTime);
	}

	/**
	 * Internal process method that subclasses should implement.
	 * Only called when the manipulator is enabled.
	 * In general, manipulators should directly modify state.
	 * 
	 * @param {import('../core/ControllerState.js').ControllerState} state
	 * @param {number} deltaTime - Time since last frame in milliseconds
	 * @returns {import('../core/ControllerState.js').ControllerState}
	 */
	_processInternal(state, deltaTime) {
		throw new Error('Subclasses must implement _processInternal()');
	}

	/**
	 * Create UI elements for this manipulator.
	 * Calls createHeader() and createControls() which can be overridden.
	 * 
	 * @param {HTMLElement} container - The container element to add UI to
	 * @returns {HTMLElement} The created UI element
	 */
	createUI(container) {
		this._container = container;

		// Create header (standard for all manipulators)
		const header = this.createHeader();
		container.appendChild(header);

		// Create manipulator-specific controls.
		// A manipulator must return its entire UI inside a div with class `manipulator-controls`.
		// It can create sub-areas using divs with class `manipulator-control-group`.
		// If a manipulator's UI needs any custom styling, it should add its name + '-custom'
		// to the classlist on the `manipulator-controls` div, and prepend all class names in the same way,
		// e.g. `turbo-grid`.
		const controls = this.createControls();
		if (controls) {
			container.appendChild(controls);
		}

		return container;
	}

	/**
	 * Create the standard header with enable/disable toggle and name.
	 * Can be overridden if needed, but usually shouldn't be.
	 * 
	 * @returns {HTMLElement}
	 */
	createHeader() {
		const header = document.createElement('div');
		header.className = 'manipulator-header';

		const titleLabel = document.createElement('label');
		titleLabel.className = 'manipulator-label';

		this._enableCheckbox = document.createElement('input');
		this._enableCheckbox.type = 'checkbox';
		this._enableCheckbox.checked = this.enabled;
		this._enableCheckbox.className = 'manipulator-enable';
		this._enableCheckbox.addEventListener('change', () => {
			this.enabled = this._enableCheckbox.checked;
			this.onEnabledChanged(this.enabled);
		});

		this._titleSpan = document.createElement('span');
		this._titleSpan.textContent = this.fullTitle;
		this._titleSpan.className = 'manipulator-name';

		titleLabel.appendChild(this._enableCheckbox);
		titleLabel.appendChild(this._titleSpan);
		header.appendChild(titleLabel);

		return header;
	}

	/**
	 * Create manipulator-specific controls.
	 * Subclasses should override this to add their own controls.
	 * 
	 * @returns {HTMLElement|null}
	 */
	createControls() {
		// Default: no additional controls
		return null;
	}

	/**
	 * Update the display name of this manipulator.
	 * Updates both internal state and UI if present.
	 * 
	 * @param {string} newTitle
	 */
	setTitle(newTitle) {
		this.fullTitle = newTitle;
		if (this._titleSpan) {
			this._titleSpan.textContent = newTitle;
		}
	}

	/**
	 * Enable this manipulator
	 */
	enable() {
		this.enabled = true;
		if (this._enableCheckbox) {
			this._enableCheckbox.checked = true;
		}
		this.onEnabledChanged(true);
	}

	/**
	 * Disable this manipulator
	 */
	disable() {
		this.enabled = false;
		if (this._enableCheckbox) {
			this._enableCheckbox.checked = false;
		}
		this.onEnabledChanged(false);
	}

	/**
	 * Toggle enabled state
	 */
	toggle() {
		if (this.enabled) {
			this.disable();
		} else {
			this.enable();
		}
	}

	/**
	 * Called when enabled state changes.
	 * Subclasses can override to react to enable/disable.
	 * 
	 * @param {boolean} enabled
	 */
	onEnabledChanged(enabled) {
		// Override in subclasses if needed
	}

	/**
	 * Get the current configuration of this manipulator.
	 * Used for saving/loading pipeline configurations.
	 * 
	 * @returns {Object}
	 */
	getConfig() {
		// Start with the original params
		const config = { ...this._params };

		// Add current enabled state
		config.enabled = this.enabled;

		// Subclasses should override _getSpecificConfig to add their own state
		const specificConfig = this._getSpecificConfig();
		Object.assign(config, specificConfig);

		return config;
	}

	/**
	 * Get manipulator-specific configuration.
	 * Subclasses should override this to include their current state.
	 * 
	 * @returns {Object}
	 */
	_getSpecificConfig() {
		return {};
	}

	/**
	 * Update the configuration of this manipulator.
	 * Used when loading saved configurations.
	 * 
	 * @param {Object} config
	 */
	setConfig(config) {
		if ('enabled' in config) {
			this.enabled = config.enabled;
			if (this._enableCheckbox) {
				this._enableCheckbox.checked = this.enabled;
			}
		}

		// Update internal params
		this._params = { ...config };
		delete this._params.enabled;
		delete this._params.id;

		// Let subclasses handle their specific config
		this._setSpecificConfig(config);
	}

	/**
	 * Set manipulator-specific configuration.
	 * Subclasses should override this to update their state from config.
	 * 
	 * @param {Object} config
	 */
	_setSpecificConfig(config) {
		// Override in subclasses
	}

	/**
	 * Reset this manipulator to its default configuration.
	 * This will restore all settings to their initial values.
	 */
	resetConfig() {
		// Get the default config for this manipulator type
		const defaultConfig = this.constructor.defaultConfig;

		// Create a fresh config object with defaults
		const resetConfig = {
			...defaultConfig
		};

		// Apply the reset configuration
		this.setConfig(resetConfig);

		this.log('Reset to default configuration');

		return resetConfig;
	}
	
	/**
	 * Get all standard gamepad buttons
	 * @returns {string[]}
	 */
	static get STANDARD_BUTTONS() {
		return [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'buttonThumbL', 'buttonThumbR'
		];
	}

	/**
	 * Get display names for all gamepad buttons
	 * @returns {Object<string, string>}
	 */
	static get BUTTON_DISPLAY_NAMES() {
		return {
			'buttonA': 'A',
			'buttonB': 'B',
			'buttonX': 'X',
			'buttonY': 'Y',
			'dpadUp': '↑',
			'dpadDown': '↓',
			'dpadLeft': '←',
			'dpadRight': '→',
			'buttonL': 'L',
			'buttonR': 'R',
			'buttonZL': 'ZL',
			'buttonZR': 'ZR',
			'buttonThumbL': 'L3',
			'buttonThumbR': 'R3',
			'buttonMinus': '-',
			'buttonPlus': '+',
			'buttonHome': 'Home',
			'buttonCapture': 'C'
		};
	}

	/**
	 * Get all standard analog axes
	 * @returns {string[]}
	 */
	static get ANALOG_AXES() {
		return ['leftX', 'leftY', 'rightX', 'rightY'];
	}

	/**
	 * Get display names for analog axes
	 * @returns {Object<string, string>}
	 */
	static get AXIS_DISPLAY_NAMES() {
		return {
			'leftX': 'Left X',
			'leftY': 'Left Y',
			'rightX': 'Right X',
			'rightY': 'Right Y'
		};
	}

	/**
	 * Get button groups for UI organization
	 * @returns {Array<{title: string, buttons: Array<{name: string, display: string}>}>}
	 */
	static get BUTTON_GROUPS() {
		return [
			{
				title: 'Face Buttons',
				buttons: [
					{ name: 'buttonA', display: this.BUTTON_DISPLAY_NAMES.buttonA },
					{ name: 'buttonB', display: this.BUTTON_DISPLAY_NAMES.buttonB },
					{ name: 'buttonX', display: this.BUTTON_DISPLAY_NAMES.buttonX },
					{ name: 'buttonY', display: this.BUTTON_DISPLAY_NAMES.buttonY }
				]
			},
			{
				title: 'D-Pad',
				buttons: [
					{ name: 'dpadUp', display: this.BUTTON_DISPLAY_NAMES.dpadUp },
					{ name: 'dpadDown', display: this.BUTTON_DISPLAY_NAMES.dpadDown },
					{ name: 'dpadLeft', display: this.BUTTON_DISPLAY_NAMES.dpadLeft },
					{ name: 'dpadRight', display: this.BUTTON_DISPLAY_NAMES.dpadRight }
				]
			},
			{
				title: 'Shoulder',
				buttons: [
					{ name: 'buttonL', display: this.BUTTON_DISPLAY_NAMES.buttonL },
					{ name: 'buttonR', display: this.BUTTON_DISPLAY_NAMES.buttonR },
					{ name: 'buttonZL', display: this.BUTTON_DISPLAY_NAMES.buttonZL },
					{ name: 'buttonZR', display: this.BUTTON_DISPLAY_NAMES.buttonZR }
				]
			},
			{
				title: 'System',
				buttons: [
					{ name: 'buttonPlus', display: this.BUTTON_DISPLAY_NAMES.buttonPlus },
					{ name: 'buttonMinus', display: this.BUTTON_DISPLAY_NAMES.buttonMinus },
					{ name: 'buttonCapture', display: this.BUTTON_DISPLAY_NAMES.buttonCapture },
					{ name: 'buttonHome', display: this.BUTTON_DISPLAY_NAMES.buttonHome }
				]
			},
			{
				title: 'Sticks',
				buttons: [
					{ name: 'buttonThumbL', display: this.BUTTON_DISPLAY_NAMES.buttonThumbL },
					{ name: 'buttonThumbR', display: this.BUTTON_DISPLAY_NAMES.buttonThumbR }
				]
			}
		];
	}

	/**
	 * Get axis groups for UI organization
	 * @returns {Array<{title: string, axes: Array<{name: string, display: string}>}>}
	 */
	static get AXIS_GROUPS() {
		return [
			{
				title: 'Left Stick',
				axes: [
					{ name: 'leftX', display: this.AXIS_DISPLAY_NAMES.leftX },
					{ name: 'leftY', display: this.AXIS_DISPLAY_NAMES.leftY }
				]
			},
			{
				title: 'Right Stick',
				axes: [
					{ name: 'rightX', display: this.AXIS_DISPLAY_NAMES.rightX },
					{ name: 'rightY', display: this.AXIS_DISPLAY_NAMES.rightY }
				]
			}
		];
	}

	/**
	 * Get system buttons (non-remappable in some contexts)
	 * @returns {string[]}
	 */
	static get SYSTEM_BUTTONS() {
		return ['buttonMinus', 'buttonPlus', 'buttonHome', 'buttonCapture'];
	}

	/**
	 * Get all buttons including system buttons
	 * @returns {string[]}
	 */
	static get ALL_BUTTONS() {
		return [...this.STANDARD_BUTTONS, ...this.SYSTEM_BUTTONS];
	}

	/**
	 * Called when the manipulator is added to a pipeline.
	 * Override for setup logic.
	 */
	onAttach() {
		// Override in subclasses if needed
	}

	/**
	 * Called when the manipulator is removed from a pipeline.
	 * Override for cleanup logic.
	 */
	onDetach() {
		// Override in subclasses if needed
	}

	/**
	 * Clean up resources when this manipulator is destroyed.
	 * Subclasses should override and call super.dispose().
	 */
	dispose() {
		this.onDetach();
		this._container = null;
		this._enableCheckbox = null;
		this._titleSpan = null;
		this._actions.clear();
	}

	/**
	 * Logging helper that includes the manipulator name
	 * @param {string} message
	 */
	log(message) {
		// Use the external logging function if set
		if (this.logMessage) this.logMessage(`[${this.constructor.displayName}] ${message}`);
		else console.log(`[${this.constructor.displayName}] ${message}`);
	}

	/**
	 * Sets a logger at the top-level if needed.
	 * 
	 * @param {function} logMessage
	 */
	setLogger(logMessage) {
		this.logMessage = logMessage;
	}
}