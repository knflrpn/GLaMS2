/**
 * ./src/manipulators/DisplayBroadcaster.js
 *
 * Manipulator that broadcasts controller state to other browser tabs/windows
 * using the BroadcastChannel API. This allows for a separate display window
 * that can be captured for streaming.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} DisplayBroadcasterParams
 * @property {boolean} [enabled=true] - Whether this manipulator is active
 * @property {string} [channelName='swicc-controller'] - Name of the broadcast channel
 * @property {string} [highlightType='controller-state-inner'] - Type string to identify this broadcast
 * @property {number} [throttleMs=16] - Minimum time between broadcasts in ms (~60fps)
 */

export class DisplayBroadcaster extends BaseManipulator {
	static get defaultConfig() {
		return {
			channelName: 'swicc-controller',
			highlightType: 'controller-state-inner',
			throttleMs: 16
		};
	}

	static get displayName() {
		return "Controller Display";
	}

	/**
	 * @param {DisplayBroadcasterParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.channelName = params.channelName || DisplayBroadcaster.defaultConfig.channelName;
		this.highlightType = params.highlightType || DisplayBroadcaster.defaultConfig.highlightType;
		this.throttleMs = params.throttleMs || DisplayBroadcaster.defaultConfig.throttleMs;

		// Initialize broadcast channel
		this.channel = new BroadcastChannel(this.channelName);
		this.lastBroadcast = 0;

		// UI elements
		this._typeSelect = null;

		// Register broadcast-specific actions
		this._registerBroadcastActions();

		this.log(`Initialized on channel: ${this.channelName} with type: ${this.highlightType}`);
	}

	/**
	 * Register actions specific to the broadcast manipulator
	 */
	_registerBroadcastActions() {
		this.registerAction({
			name: 'setHighlightingType',
			displayName: 'Set Highlighting Type',
			description: 'Set button highlighting style (inner or outer)',
			parameters: [
				{
					name: 'type',
					type: 'string',
					description: 'Highlighting type: "inner" or "outer"',
					required: true
				}
			],
			handler: (params) => this.setHighlightingType(params.type)
		});

		this.registerAction({
			name: 'getHighlightingType',
			displayName: 'Get Highlighting Type',
			description: 'Get current button highlighting style',
			handler: () => this.getHighlightingType()
		});

		this.registerAction({
			name: 'toggleHighlighting',
			displayName: 'Toggle Highlighting',
			description: 'Toggle between inner and outer highlighting',
			handler: () => this.toggleHighlighting()
		});
	}

	/**
	 * Set the highlighting type
	 * @param {string} type - 'inner' or 'outer'
	 */
	setHighlightingType(type) {
		const validTypes = {
			'inner': 'controller-state-inner',
			'outer': 'controller-state-outer'
		};

		// Also accept the full broadcast type strings
		if (type === 'controller-state-inner' || type === 'controller-state-outer') {
			this.highlightType = type;
		} else if (type in validTypes) {
			this.highlightType = validTypes[type];
		} else {
			throw new Error(`Invalid highlighting type: ${type}. Must be "inner" or "outer"`);
		}

		// Update UI if it exists
		if (this._typeSelect) {
			this._typeSelect.value = this.highlightType;
		}

		// Notify connected displays of the change
		this.sendControlMessage('highlighting-changed', {
			type: this.highlightType
		});

		this.log(`Highlighting type changed to: ${type}`);
		return this.getHighlightingType();
	}

	/**
	 * Get the current highlighting type
	 * @returns {string} 'inner' or 'outer'
	 */
	getHighlightingType() {
		return this.highlightType === 'controller-state-inner' ? 'inner' : 'outer';
	}

	/**
	 * Toggle between inner and outer highlighting
	 * @returns {string} The new highlighting type
	 */
	toggleHighlighting() {
		const newType = this.getHighlightingType() === 'inner' ? 'outer' : 'inner';
		return this.setHighlightingType(newType);
	}

	_processInternal(state, deltaTime) {
		const now = Date.now();

		// Throttle broadcasts to avoid overwhelming the channel
		if (now - this.lastBroadcast >= this.throttleMs) {
			this.broadcastState(state);
			this.lastBroadcast = now;
		}

		return state;
	}

	/**
	 * Broadcasts the controller state to listening windows/tabs
	 */
	broadcastState(state) {
		try {
			const message = {
				type: 'controller-state',
				timestamp: Date.now(),
				dataType: this.highlightType,
				state: this.serializeState(state)
			};

			// Send the message
			this.channel.postMessage(message);

		} catch (error) {
			this.log(`Broadcast error: ${error.message}`);
		}
	}

	/**
	 * Serializes a controller state for transmission
	 */
	serializeState(state) {
		return {
			digital: { ...state.digital },
			analog: { ...state.analog },
			imuSamples: state.imuSamples.map(s => ({ ...s })),
			timestamp: Date.now()
		};
	}

	/**
	 * Sends a control message to listening windows
	 */
	sendControlMessage(type, data = {}) {
		try {
			this.channel.postMessage({
				type: 'control',
				subType: type,
				timestamp: Date.now(),
				dataType: this.highlightType,
				data
			});
		} catch (error) {
			this.log(`Control message error: ${error.message}`);
		}
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls';

		// Broadcast type control
		const typeDiv = document.createElement('div');
		typeDiv.className = 'manipulator-control-group';

		const typeLabel = document.createElement('label');
		typeLabel.textContent = 'Button Highlighting:';
		typeLabel.className = 'control-label';

		this._typeSelect = document.createElement('select');
		this._typeSelect.className = 'control-select';

		const typeOptions = [
			{ value: 'controller-state-inner', text: 'Inner Highlighting' },
			{ value: 'controller-state-outer', text: 'Outer Highlighting' },
		];

		typeOptions.forEach(opt => {
			const option = document.createElement('option');
			option.value = opt.value;
			option.textContent = opt.text;
			this._typeSelect.appendChild(option);
		});

		this._typeSelect.value = this.highlightType;

		this._typeSelect.addEventListener('change', () => {
			const type = this._typeSelect.value === 'controller-state-inner' ? 'inner' : 'outer';
			this.executeAction('setHighlightingType', { type });
		});

		typeDiv.appendChild(typeLabel);
		typeDiv.appendChild(this._typeSelect);

		container.appendChild(typeDiv);

		return container;
	}

	_getSpecificConfig() {
		return {
			channelName: this.channelName,
			highlightType: this.highlightType,
			throttleMs: this.throttleMs
		};
	}

	_setSpecificConfig(config) {
		if (config.channelName !== undefined) {
			this.channelName = config.channelName;
			// Would need to recreate channel if changed
		}

		if (config.highlightType !== undefined) {
			this.highlightType = config.highlightType;
			if (this._typeSelect) {
				this._typeSelect.value = this.highlightType;
			}
		}

		if (config.throttleMs !== undefined) {
			this.throttleMs = config.throttleMs;
		}
	}

	onAttach() {
		super.onAttach();
		this.sendControlMessage('manipulator-attached', {
			type: this.highlightType
		});
	}

	onDetach() {
		super.onDetach();
		this.sendControlMessage('manipulator-detached', {
			type: this.highlightType
		});
	}

	dispose() {
		super.dispose();

		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}

		this._typeSelect = null;

		this.log('Disposed');
	}
}