/**
 * ./src/manipulators/Delay.js
 *
 * Manipulator that delays controller input by a specified amount of time.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} DelayParams
 * @property {number} [delay=0] - Delay in seconds (0-2)
 */

export class InputDelay extends BaseManipulator {
	static get defaultConfig() {
		return {
			delay: 0
		};
	}
	static get displayName() {
		return "Input Delay";
	}

	static get description() {
		return "Introduce a delay from input controller state to output controller state.";
	}

	/**
	 * @param {DelayParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);
		
		this.delay = Math.max(0, Math.min(2, params.delay || 0)); // Clamp to 0-2 seconds
		this.delayMs = this.delay * 1000; // Convert to milliseconds
		
		// Ring buffer implementation
		this.bufferSize = 240; // Enough for 2 seconds at 120fps
		this.stateBuffer = new Array(this.bufferSize);
		this.timestampBuffer = new Array(this.bufferSize);
		this.writeIndex = 0;
		this.readIndex = 0;
		this.bufferCount = 0;
		
		// Track the last valid output state
		this.lastOutputState = null;
		
		// Initialize buffers
		for (let i = 0; i < this.bufferSize; i++) {
			this.stateBuffer[i] = null;
			this.timestampBuffer[i] = 0;
		}
		
		// UI elements
		this._delaySlider = null;
		this._delayDisplay = null;

		// Register delay-specific actions
		this._registerDelayActions();
	}

	/**
	 * Register actions specific to the delay manipulator
	 */
	_registerDelayActions() {
		this.registerAction({
			name: 'setDelay',
			displayName: 'Set Delay',
			description: 'Set the delay time in seconds',
			parameters: [
				{
					name: 'delay',
					type: 'number',
					description: 'Delay in seconds (0-2)',
					required: true,
					default: 0
				}
			],
			handler: (params) => this.setDelay(params.delay)
		});

		this.registerAction({
			name: 'getDelay',
			displayName: 'Get Delay',
			description: 'Get the current delay in seconds',
			handler: () => this.delay
		});

		this.registerAction({
			name: 'getBufferSize',
			displayName: 'Get Buffer Size',
			description: 'Get the number of states currently in the buffer',
			handler: () => this.bufferCount
		});
	}

	/**
	 * Set the delay time
	 * @param {number} delay - Delay in seconds (0-2)
	 */
	setDelay(delay) {
		const newDelay = Math.max(0, Math.min(2, delay));
		const oldDelayMs = this.delayMs;
		
		this.delay = newDelay;
		this.delayMs = newDelay * 1000;

		// When reducing delay, we might need to output some buffered states immediately
		if (this.delayMs < oldDelayMs) {
			this._adjustBufferForReducedDelay(oldDelayMs - this.delayMs);
		}

		// Update UI if it exists
		if (this._delaySlider) {
			this._delaySlider.value = newDelay;
		}
		if (this._delayDisplay) {
			this._delayDisplay.textContent = `${newDelay.toFixed(2)}s`;
		}

		this.log(`Delay set to ${newDelay.toFixed(2)} seconds`);
		return newDelay;
	}

	/**
	 * Clear all buffered states
	 */
	clearBuffer() {
		const size = this.bufferCount;
		this.writeIndex = 0;
		this.readIndex = 0;
		this.bufferCount = 0;
		this.lastOutputState = null;
		
		// Clear the buffer contents
		for (let i = 0; i < this.bufferSize; i++) {
			this.stateBuffer[i] = null;
			this.timestampBuffer[i] = 0;
		}
		
		this.log(`Cleared ${size} buffered states`);
		return true;
	}

	/**
	 * Adjust buffer timestamps when delay is reduced
	 * @param {number} reduction - Amount of delay reduction in milliseconds
	 */
	_adjustBufferForReducedDelay(reduction) {
		const now = performance.now();
		
		// Adjust all timestamps by the reduction amount
		for (let i = 0; i < this.bufferCount; i++) {
			const index = (this.readIndex + i) % this.bufferSize;
			this.timestampBuffer[index] -= reduction;
		}
		
		// Now process any states that should be output immediately
		let statesToRemove = 0;
		for (let i = 0; i < this.bufferCount; i++) {
			const index = (this.readIndex + i) % this.bufferSize;
			if (this.timestampBuffer[index] <= now) {
				// This state should have been output already, so it becomes our last output
				this.lastOutputState = this.stateBuffer[index];
				statesToRemove = i + 1;
			} else {
				break;
			}
		}
		
		// Update pointers if we removed states
		if (statesToRemove > 0) {
			this.readIndex = (this.readIndex + statesToRemove) % this.bufferSize;
			this.bufferCount -= statesToRemove;
		}
	}

	_processInternal(state, deltaTime) {
		const now = performance.now();
		
		// If delay is 0, pass through immediately
		if (this.delayMs === 0) {
			// Clear buffer if we just switched to zero delay
			if (this.bufferCount > 0) {
				this.clearBuffer();
			}
			this.lastOutputState = state;
			return state;
		}

		// Store the incoming state in the ring buffer
		if (!this.stateBuffer[this.writeIndex]) {
			// Allocate a new state object if needed
			this.stateBuffer[this.writeIndex] = new (state.constructor)();
		}
		
		// Copy state data into the buffer
		const bufferState = this.stateBuffer[this.writeIndex];
		Object.assign(bufferState.digital, state.digital);
		Object.assign(bufferState.analog, state.analog);
		Object.assign(bufferState.imuSample, state.imuSample);
		
		// Store the timestamp
		this.timestampBuffer[this.writeIndex] = now + this.delayMs;
		
		// Advance write pointer
		this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
		if (this.bufferCount < this.bufferSize) {
			this.bufferCount++;
		} else {
			// Buffer is full, advance read pointer to maintain ring buffer
			this.readIndex = (this.readIndex + 1) % this.bufferSize;
		}

		// Find the state that should be output now
		let outputState = null;
		let statesToRemove = 0;

		// Look through buffered states to find what to output
		for (let i = 0; i < this.bufferCount; i++) {
			const index = (this.readIndex + i) % this.bufferSize;
			if (this.timestampBuffer[index] <= now) {
				outputState = this.stateBuffer[index];
				statesToRemove = i + 1;
			} else {
				break; // States are in chronological order
			}
		}

		// Update read pointer if we found states to output
		if (statesToRemove > 0) {
			this.readIndex = (this.readIndex + statesToRemove) % this.bufferSize;
			this.bufferCount -= statesToRemove;
		}

		// If we have a state to output, use it
		if (outputState) {
			this.lastOutputState = outputState;
			return outputState;
		} else if (this.lastOutputState) {
			// Use the last valid output state if we have one
			return this.lastOutputState;
		} else {
			// Only return neutral state if we've never had a valid output
			const neutralState = this.copyState(state);
			
			// Clear all digital inputs
			Object.keys(neutralState.digital).forEach(key => {
				neutralState.digital[key] = false;
			});
			
			// Center all analog inputs
			neutralState.analog.stickLX = 0;
			neutralState.analog.stickLY = 0;
			neutralState.analog.stickRX = 0;
			neutralState.analog.stickRY = 0;
			
			// Clear IMU sample
			neutralState.imuSample = {};
			
			return neutralState;
		}
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls';

		// Delay control group
		const delayDiv = document.createElement('div');
		delayDiv.className = 'manipulator-control-group';

		const delayLabel = document.createElement('label');
		delayLabel.textContent = 'Delay:';

		// Slider for delay adjustment
		this._delaySlider = document.createElement('input');
		this._delaySlider.type = 'range';
		this._delaySlider.min = '0';
		this._delaySlider.max = '2';
		this._delaySlider.step = '0.2';
		this._delaySlider.value = this.delay;
		this._delaySlider.className = 'delay-slider';

		// Display for current delay value
		this._delayDisplay = document.createElement('span');
		this._delayDisplay.className = 'delay-display';
		this._delayDisplay.textContent = `${this.delay.toFixed(2)}s`;

		// Update delay on slider change
		this._delaySlider.addEventListener('input', () => {
			const newDelay = parseFloat(this._delaySlider.value);
			this._delayDisplay.textContent = `${newDelay.toFixed(2)}s`;
		});

		this._delaySlider.addEventListener('change', () => {
			const newDelay = parseFloat(this._delaySlider.value);
			this.executeAction('setDelay', { delay: newDelay });
		});

		delayDiv.appendChild(delayLabel);
		delayDiv.appendChild(this._delaySlider);
		delayDiv.appendChild(this._delayDisplay);

		// Buffer info
		const infoDiv = document.createElement('div');
		infoDiv.className = 'manipulator-control-group';

		// Quick preset buttons
		const presetsDiv = document.createElement('div');
		presetsDiv.className = 'manipulator-control-group';

		const presetsLabel = document.createElement('p');
		presetsLabel.textContent = 'Presets:';

		const presetButtons = document.createElement('div');
		presetButtons.className = 'delay-presets';

		const presets = [
			{ label: 'None', value: 0 },
			{ label: '100ms', value: 0.1 },
			{ label: '250ms', value: 0.25 },
			{ label: '500ms', value: 0.5 },
			{ label: '1s', value: 1 },
			{ label: '2s', value: 2 }
		];

		presets.forEach(preset => {
			const btn = document.createElement('button');
			btn.textContent = preset.label;
			btn.className = 'button small';
			btn.addEventListener('click', () => {
				this.executeAction('setDelay', { delay: preset.value });
			});
			presetButtons.appendChild(btn);
		});

		presetsDiv.appendChild(presetsLabel);
		presetsDiv.appendChild(presetButtons);

		// Assemble the UI
		container.appendChild(delayDiv);
		container.appendChild(infoDiv);
		container.appendChild(presetsDiv);

		return container;
	}

	_getSpecificConfig() {
		return {
			delay: this.delay
		};
	}

	_setSpecificConfig(config) {
		if (config.delay !== undefined) {
			this.setDelay(config.delay);
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Clear buffer when disabled to avoid unexpected delayed inputs
			this.clearBuffer();
		}
	}

	onDetach() {
		super.onDetach();
		this.clearBuffer();
	}

	dispose() {
		super.dispose();
		this._delaySlider = null;
		this._delayDisplay = null;
		this.stateBuffer = null;
		this.timestampBuffer = null;
	}
}