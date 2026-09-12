/**
 * ./src/manipulators/RandomInput.js
 *
 * Manipulator that generates random inputs for selected buttons and axes.
 * Useful for chaos modes, testing stability, or AFK prevention.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} RandomInputParams
 * @property {number} [updateInterval=100] - How often inputs change in milliseconds
 * @property {number} [density=0.5] - Probability (0.0-1.0) of a button being pressed during a cycle
 * @property {string[]} [randomButtons=[]] - Array of button names to randomize
 * @property {boolean} [enableLeftStick=false] - Whether to randomize Left Stick
 * @property {boolean} [enableRightStick=false] - Whether to randomize Right Stick
 */

export class RandomInput extends BaseManipulator {
	static get defaultConfig() {
		return {
			updateInterval: 200,
			density: 0.5,
			randomButtons: [],
			enableLeftStick: false,
			enableRightStick: false,
		};
	}

	static get displayName() {
		return "Random Input";
	}

	static get description() {
		return "Generates chaotic random inputs for selected controls at a set frequency.";
	}

	/**
	 * @param {RandomInputParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.updateInterval = params.updateInterval || 200;
		this.density = params.density !== undefined ? params.density : 0.5;
		this.randomButtons = new Set(params.randomButtons || []);
		this.enableLeftStick = params.enableLeftStick || false;
		this.enableRightStick = params.enableRightStick || false;

		// Internal state tracking
		this.timer = 0;

		// Current random state to hold between updates
		this.currentDigital = {};
		this.currentAnalog = {
			leftX: 0, leftY: 0,
			rightX: 0, rightY: 0
		};

		// UI elements
		this._intervalInput = null;
		this._densityInput = null;
		this._densityDisplay = null;
		this._leftStickCheckbox = null;
		this._rightStickCheckbox = null;
		this._buttonCheckboxes = new Map();

		this._registerRandomActions();
	}

	_registerRandomActions() {
		this.registerAction({
			name: 'setUpdateInterval',
			displayName: 'Set Update Interval',
			description: 'Set how often inputs change (ms)',
			parameters: [
				{ name: 'interval', type: 'number', required: true, default: 200 }
			],
			handler: (params) => this.setUpdateInterval(params.interval)
		});

		this.registerAction({
			name: 'setDensity',
			displayName: 'Set Input Density',
			description: 'Set probability of press (0.0 - 1.0)',
			parameters: [
				{ name: 'density', type: 'number', required: true, default: 0.5 }
			],
			handler: (params) => this.setDensity(params.density)
		});

		this.registerAction({
			name: 'setLeftStickEnabled',
			displayName: 'Toggle Left Stick',
			parameters: [{ name: 'enabled', type: 'boolean', required: true }],
			handler: (params) => this.setLeftStickEnabled(params.enabled)
		});

		this.registerAction({
			name: 'setRightStickEnabled',
			displayName: 'Toggle Right Stick',
			parameters: [{ name: 'enabled', type: 'boolean', required: true }],
			handler: (params) => this.setRightStickEnabled(params.enabled)
		});

		this.registerAction({
			name: 'addButton',
			displayName: 'Add Random Button',
			parameters: [{ name: 'buttonName', type: 'string', required: true }],
			handler: (params) => this.addButton(params.buttonName)
		});

		this.registerAction({
			name: 'removeButton',
			displayName: 'Remove Random Button',
			parameters: [{ name: 'buttonName', type: 'string', required: true }],
			handler: (params) => this.removeButton(params.buttonName)
		});

		this.registerAction({
			name: 'clearButtons',
			displayName: 'Clear Buttons',
			description: 'Stop randomizing all buttons',
			handler: () => this.clearButtons()
		});
	}

	setUpdateInterval(interval) {
		this.updateInterval = Math.max(16, Math.min(5000, interval));
		if (this._intervalInput) this._intervalInput.value = this.updateInterval;
		this.log(`Update interval set to ${this.updateInterval}ms`);
		return this.updateInterval;
	}

	setDensity(density) {
		this.density = Math.max(0, Math.min(1, density));
		if (this._densityInput) this._densityInput.value = Math.floor(this.density * 100);
		if (this._densityDisplay) this._densityDisplay.textContent = `${Math.floor(this.density * 100)}%`;
		this.log(`Density set to ${this.density}`);
		return this.density;
	}

	setLeftStickEnabled(enabled) {
		this.enableLeftStick = enabled;
		if (this._leftStickCheckbox) this._leftStickCheckbox.checked = enabled;
		// Reset to 0 when disabled so it doesn't get stuck
		if (!enabled) {
			this.currentAnalog.leftX = 0;
			this.currentAnalog.leftY = 0;
		}
		return enabled;
	}

	setRightStickEnabled(enabled) {
		this.enableRightStick = enabled;
		if (this._rightStickCheckbox) this._rightStickCheckbox.checked = enabled;
		// Reset to 0 when disabled
		if (!enabled) {
			this.currentAnalog.rightX = 0;
			this.currentAnalog.rightY = 0;
		}
		return enabled;
	}

	addButton(buttonName) {
		this.randomButtons.add(buttonName);
		const checkbox = this._buttonCheckboxes.get(buttonName);
		if (checkbox) checkbox.checked = true;
		return true;
	}

	removeButton(buttonName) {
		this.randomButtons.delete(buttonName);
		const checkbox = this._buttonCheckboxes.get(buttonName);
		if (checkbox) checkbox.checked = false;
		// Clear state
		delete this.currentDigital[buttonName];
		return true;
	}

	clearButtons() {
		this.randomButtons.clear();
		this._buttonCheckboxes.forEach(cb => cb.checked = false);
		this.currentDigital = {};
		return true;
	}

	/**
	 * Generates a new set of random inputs based on density settings
	 */
	_randomize() {
		// Randomize Buttons
		for (const btn of this.randomButtons) {
			this.currentDigital[btn] = Math.random() < this.density;
		}

		// Randomize Left Stick
		if (this.enableLeftStick) {
			// If RNG check fails against density, center the stick.
			// Otherwise pick a random point -1 to 1.
			if (Math.random() < this.density) {
				this.currentAnalog.leftX = (Math.random() * 2) - 1;
				this.currentAnalog.leftY = (Math.random() * 2) - 1;
			} else {
				this.currentAnalog.leftX = 0;
				this.currentAnalog.leftY = 0;
			}
		}

		// Randomize Right Stick
		if (this.enableRightStick) {
			if (Math.random() < this.density) {
				this.currentAnalog.rightX = (Math.random() * 2) - 1;
				this.currentAnalog.rightY = (Math.random() * 2) - 1;
			} else {
				this.currentAnalog.rightX = 0;
				this.currentAnalog.rightY = 0;
			}
		}
	}

	_processInternal(state, deltaTime) {
		// Update timer
		this.timer += deltaTime;

		// Check if it's time to generate new chaos
		if (this.timer >= this.updateInterval) {
			this._randomize();
			this.timer = 0;
		}

		// Apply the cached random state to the controller state

		// 1. Apply Buttons
		for (const btn of this.randomButtons) {
			// We override the user input for selected buttons
			state.digital[btn] = this.currentDigital[btn] || false;
		}

		// 2. Apply Sticks
		if (this.enableLeftStick) {
			state.analog.leftX = this.currentAnalog.leftX;
			state.analog.leftY = this.currentAnalog.leftY;
		}

		if (this.enableRightStick) {
			state.analog.rightX = this.currentAnalog.rightX;
			state.analog.rightY = this.currentAnalog.rightY;
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls random-input-custom';

		// --- Group 1: Timing & Density ---
		const mainGroup = document.createElement('div');
		mainGroup.className = 'manipulator-control-group';

		// Interval Control
		const intervalDiv = document.createElement('div');
		const intervalLabel = document.createElement('label');
		intervalLabel.textContent = 'Change Interval (ms): ';

		this._intervalInput = document.createElement('input');
		this._intervalInput.type = 'number';
		this._intervalInput.min = '16';
		this._intervalInput.max = '5000';
		this._intervalInput.value = this.updateInterval;
		this._intervalInput.className = 'small-input';
		this._intervalInput.addEventListener('change', () => {
			this.executeAction('setUpdateInterval', { interval: parseInt(this._intervalInput.value) });
		});

		intervalLabel.appendChild(this._intervalInput);
		intervalDiv.appendChild(intervalLabel);

		// Density Control
		const densityDiv = document.createElement('div');
		const densityLabel = document.createElement('label');
		densityLabel.textContent = 'Action Density: ';

		this._densityInput = document.createElement('input');
		this._densityInput.type = 'range';
		this._densityInput.min = '0';
		this._densityInput.max = '100';
		this._densityInput.value = this.density * 100;

		this._densityDisplay = document.createElement('span');
		this._densityDisplay.textContent = `${Math.floor(this.density * 100)}%`;
		this._densityDisplay.style.marginLeft = '8px';
		this._densityDisplay.style.minWidth = '3em';
		this._densityDisplay.style.display = 'inline-block';

		this._densityInput.addEventListener('input', () => {
			this.executeAction('setDensity', { density: parseInt(this._densityInput.value) / 100 });
		});

		densityLabel.appendChild(this._densityInput);
		densityLabel.appendChild(this._densityDisplay);
		densityDiv.appendChild(densityLabel);

		mainGroup.appendChild(intervalDiv);
		mainGroup.appendChild(densityDiv);

		// --- Group 2: Stick Selection ---
		const sticksGroup = document.createElement('div');
		sticksGroup.className = 'manipulator-control-group';
		sticksGroup.innerHTML = '<p>Randomize Sticks:</p>';

		const stickLabels = document.createElement('div');
		stickLabels.className = 'inline-with-gap';

		// Left Stick
		const lStickLabel = document.createElement('label');
		this._leftStickCheckbox = document.createElement('input');
		this._leftStickCheckbox.type = 'checkbox';
		this._leftStickCheckbox.checked = this.enableLeftStick;
		this._leftStickCheckbox.addEventListener('change', () => {
			this.executeAction('setLeftStickEnabled', { enabled: this._leftStickCheckbox.checked });
		});
		lStickLabel.appendChild(this._leftStickCheckbox);
		lStickLabel.appendChild(document.createTextNode(' Left Stick'));

		// Right Stick
		const rStickLabel = document.createElement('label');
		this._rightStickCheckbox = document.createElement('input');
		this._rightStickCheckbox.type = 'checkbox';
		this._rightStickCheckbox.checked = this.enableRightStick;
		this._rightStickCheckbox.addEventListener('change', () => {
			this.executeAction('setRightStickEnabled', { enabled: this._rightStickCheckbox.checked });
		});
		rStickLabel.appendChild(this._rightStickCheckbox);
		rStickLabel.appendChild(document.createTextNode(' Right Stick'));

		stickLabels.appendChild(lStickLabel);
		stickLabels.appendChild(rStickLabel);
		sticksGroup.appendChild(stickLabels);

		// --- Group 3: Button Grid ---
		const buttonsGroup = document.createElement('div');
		buttonsGroup.className = 'manipulator-control-group';

		const buttonsHeader = document.createElement('div');
		buttonsHeader.style.display = 'flex';
		buttonsHeader.style.justifyContent = 'space-between';
		buttonsHeader.style.alignItems = 'center';
		buttonsHeader.innerHTML = '<p>Randomize Buttons:</p>';

		const clearBtn = document.createElement('button');
		clearBtn.textContent = 'Clear All';
		clearBtn.className = 'button small';
		clearBtn.style.marginLeft = '10px';
		clearBtn.addEventListener('click', () => this.executeAction('clearButtons'));

		buttonsHeader.appendChild(clearBtn);
		buttonsGroup.appendChild(buttonsHeader);

		// Grid Container
		const buttonGrid = document.createElement('div');
		buttonGrid.className = 'random-button-grid';

		BaseManipulator.BUTTON_GROUPS.forEach(group => {
			const groupDiv = document.createElement('div');
			groupDiv.className = 'button-subgroup';

			const groupTitle = document.createElement('p');
			groupTitle.textContent = group.title;
			groupTitle.style.fontSize = '0.8em';
			groupTitle.style.marginBottom = '4px';
			groupTitle.style.opacity = '0.8';
			groupDiv.appendChild(groupTitle);

			group.buttons.forEach(button => {
				const buttonLabel = document.createElement('label');
				buttonLabel.style.display = 'block';

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.checked = this.randomButtons.has(button.name);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.executeAction('addButton', { buttonName: button.name });
					} else {
						this.executeAction('removeButton', { buttonName: button.name });
					}
				});

				this._buttonCheckboxes.set(button.name, checkbox);

				const labelText = document.createElement('span');
				labelText.textContent = ` ${button.display}`;

				buttonLabel.appendChild(checkbox);
				buttonLabel.appendChild(labelText);
				groupDiv.appendChild(buttonLabel);
			});

			buttonGrid.appendChild(groupDiv);
		});

		buttonsGroup.appendChild(buttonGrid);

		// Assemble
		container.appendChild(mainGroup);
		container.appendChild(sticksGroup);
		container.appendChild(buttonsGroup);

		// Custom Styles
		const style = document.createElement('style');
		style.textContent = `
			.random-button-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
				gap: 12px;
			}
			.random-input-custom .small-input {
				width: 60px;
				margin-left: 5px;
			}
			.random-input-custom .inline-with-gap {
				display: flex;
				gap: 15px;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		return {
			updateInterval: this.updateInterval,
			density: this.density,
			randomButtons: Array.from(this.randomButtons),
			enableLeftStick: this.enableLeftStick,
			enableRightStick: this.enableRightStick
		};
	}

	_setSpecificConfig(config) {
		if (config.updateInterval !== undefined) this.setUpdateInterval(config.updateInterval);
		if (config.density !== undefined) this.setDensity(config.density);
		if (config.enableLeftStick !== undefined) this.setLeftStickEnabled(config.enableLeftStick);
		if (config.enableRightStick !== undefined) this.setRightStickEnabled(config.enableRightStick);

		if (config.randomButtons !== undefined) {
			this.randomButtons = new Set(config.randomButtons);
			this._buttonCheckboxes.forEach((cb, name) => {
				cb.checked = this.randomButtons.has(name);
			});
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Reset analog values so they don't stick when disabling
			this.currentAnalog.leftX = 0;
			this.currentAnalog.leftY = 0;
			this.currentAnalog.rightX = 0;
			this.currentAnalog.rightY = 0;
			this.currentDigital = {};
		}
	}

	dispose() {
		super.dispose();
		this._buttonCheckboxes.clear();
		this.currentDigital = {};
	}
}