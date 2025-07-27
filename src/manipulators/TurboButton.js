/**
 * ./src/manipulators/TurboButton.js
 *
 * Manipulator that adds turbo (rapid press/release) to specific buttons.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} TurboButtonParams
 * @property {string[]} [turboButtons=[]] - Array of button names to make turbo
 * @property {number} [frequency=20] - Turbo frequency in Hz (presses per second)
 */

export class TurboButton extends BaseManipulator {
	static get defaultConfig() {
		return {
			turboButtons: [],
			frequency: 20
		};
	}
	static get displayName() {
		return "Turbo";
	}

	static get description() {
		return "Create a turbo effect on selected buttons.";
	}

	/**
	 * @param {TurboButtonParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);
		
		this.turboButtons = new Set(params.turboButtons || []);
		this.frequency = params.frequency || TurboButton.defaultConfig.frequency;
		this.period = 1000 / this.frequency; // milliseconds
		this.timers = new Map(); // button -> accumulated time

		// UI elements
		this._freqInput = null;
		this._buttonCheckboxes = new Map(); // button name -> checkbox element

		// Register turbo-specific actions
		this._registerTurboActions();
	}

	/**
	 * Register actions specific to the turbo manipulator
	 */
	_registerTurboActions() {
		this.registerAction({
			name: 'setFrequency',
			displayName: 'Set Frequency',
			description: 'Set the turbo frequency in Hz',
			parameters: [
				{
					name: 'frequency',
					type: 'number',
					description: 'Frequency in Hz (1-20)',
					required: true,
					default: 20
				}
			],
			handler: (params) => this.setFrequency(params.frequency)
		});

		this.registerAction({
			name: 'addButton',
			displayName: 'Add Turbo Button',
			description: 'Add a button to the turbo list',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button (e.g., buttonA, dpadUp)',
					required: true
				}
			],
			handler: (params) => this.addButton(params.buttonName)
		});

		this.registerAction({
			name: 'removeButton',
			displayName: 'Remove Turbo Button',
			description: 'Remove a button from the turbo list',
			parameters: [
				{
					name: 'buttonName',
					type: 'string',
					description: 'Name of the button to remove',
					required: true
				}
			],
			handler: (params) => this.removeButton(params.buttonName)
		});

		this.registerAction({
			name: 'setButtons',
			displayName: 'Set Turbo Buttons',
			description: 'Set the complete list of turbo buttons',
			parameters: [
				{
					name: 'buttons',
					type: 'array',
					description: 'Array of button names',
					required: true
				}
			],
			handler: (params) => this.setButtons(params.buttons)
		});

		this.registerAction({
			name: 'getButtons',
			displayName: 'Get Turbo Buttons',
			description: 'Get the current list of turbo buttons',
			handler: () => Array.from(this.turboButtons)
		});

		this.registerAction({
			name: 'clearButtons',
			displayName: 'Clear All Turbo Buttons',
			description: 'Remove all buttons from the turbo list',
			handler: () => this.clearButtons()
		});

		this.registerAction({
			name: 'enableAll',
			displayName: 'Enable All Buttons',
			description: 'Add all available buttons to turbo',
			handler: () => this.enableAllButtons()
		});
	}

	/**
	 * Set the turbo frequency
	 * @param {number} frequency - Frequency in Hz (1-20)
	 */
	setFrequency(frequency) {
		const newFreq = Math.max(1, Math.min(20, frequency));
		this.frequency = newFreq;
		this.period = 1000 / newFreq;

		if (this._freqInput) {
			this._freqInput.value = newFreq;
		}

		this.log(`Frequency set to ${newFreq} Hz`);
		return newFreq;
	}

	/**
	 * Add a button to the turbo list
	 * @param {string} buttonName
	 */
	addButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		this.turboButtons.add(buttonName);

		// Update UI if it exists
		const checkbox = this._buttonCheckboxes.get(buttonName);
		if (checkbox) {
			checkbox.checked = true;
		}

		this.log(`Added turbo to ${buttonName}`);
		return true;
	}

	/**
	 * Remove a button from the turbo list
	 * @param {string} buttonName
	 */
	removeButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		const removed = this.turboButtons.delete(buttonName);
		if (removed) {
			this.timers.delete(buttonName); // Clear any active timer

			// Update UI if it exists
			const checkbox = this._buttonCheckboxes.get(buttonName);
			if (checkbox) {
				checkbox.checked = false;
			}

			this.log(`Removed turbo from ${buttonName}`);
		}

		return removed;
	}

	/**
	 * Set the complete list of turbo buttons
	 * @param {string[]} buttons
	 */
	setButtons(buttons) {
		if (!Array.isArray(buttons)) {
			throw new Error('Buttons must be an array');
		}

		// Clear existing
		this.turboButtons.clear();
		this.timers.clear();

		// Add new buttons
		buttons.forEach(button => this.turboButtons.add(button));

		// Update all checkboxes
		this._buttonCheckboxes.forEach((checkbox, buttonName) => {
			checkbox.checked = this.turboButtons.has(buttonName);
		});

		this.log(`Set turbo buttons: ${buttons.join(', ')}`);
		return Array.from(this.turboButtons);
	}

	/**
	 * Clear all turbo buttons
	 */
	clearButtons() {
		this.turboButtons.clear();
		this.timers.clear();

		// Update UI
		this._buttonCheckboxes.forEach(checkbox => {
			checkbox.checked = false;
		});

		this.log('Cleared all turbo buttons');
		return true;
	}

	/**
	 * Enable turbo for all available buttons
	 */
	enableAllButtons() {
		const allButtons = [
			'buttonA', 'buttonB', 'buttonX', 'buttonY',
			'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
			'buttonL', 'buttonR', 'buttonZL', 'buttonZR',
			'buttonThumbL', 'buttonThumbR'
		];

		allButtons.forEach(button => this.turboButtons.add(button));

		// Update UI
		this._buttonCheckboxes.forEach((checkbox, buttonName) => {
			checkbox.checked = true;
		});

		this.log('Enabled turbo for all buttons');
		return Array.from(this.turboButtons);
	}

	_processInternal(state, deltaTime) {
		// Apply turbo to specified buttons
		for (const buttonName of this.turboButtons) {
			if (buttonName in state.digital && state.digital[buttonName]) {
				// Button is pressed, apply turbo

				// Initialize timer if needed
				if (!this.timers.has(buttonName)) {
					this.timers.set(buttonName, 0);
				}

				// Accumulate time and calculate cycle position
				const elapsed = this.timers.get(buttonName) + deltaTime;
				this.timers.set(buttonName, elapsed % this.period);

				// Toggle button state based on turbo cycle
				const cyclePosition = (elapsed % this.period) / this.period;
				state.digital[buttonName] = cyclePosition < 0.5;
			} else {
				// Button not pressed, reset timer
				this.timers.delete(buttonName);
			}
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls';

		// Frequency control
		const frequencyDiv = document.createElement('div');
		frequencyDiv.className = 'manipulator-control-group';

		const freqLabel = document.createElement('label');
		freqLabel.textContent = 'Frequency (Hz):';

		this._freqInput = document.createElement('input');
		this._freqInput.type = 'number';
		this._freqInput.min = '1';
		this._freqInput.max = '20';
		this._freqInput.value = this.frequency;

		this._freqInput.addEventListener('change', () => {
			const newFreq = parseInt(this._freqInput.value) || 20;
			this.executeAction('setFrequency', { frequency: newFreq });
		});

		frequencyDiv.appendChild(freqLabel);
		frequencyDiv.appendChild(this._freqInput);

		// Button selection
		const buttonsDiv = document.createElement('div');
		buttonsDiv.className = 'manipulator-control-group';

		const buttonsLabel = document.createElement('p');
		buttonsLabel.textContent = 'Turbo Buttons:';

		// Define button groups
		const buttonGroups = [
			{
				title: 'Face Buttons',
				buttons: [
					{ name: 'buttonA', display: 'A' },
					{ name: 'buttonB', display: 'B' },
					{ name: 'buttonX', display: 'X' },
					{ name: 'buttonY', display: 'Y' }
				]
			},
			{
				title: 'D-Pad',
				buttons: [
					{ name: 'dpadUp', display: 'Up' },
					{ name: 'dpadDown', display: 'Down' },
					{ name: 'dpadLeft', display: 'Left' },
					{ name: 'dpadRight', display: 'Right' }
				]
			},
			{
				title: 'Shoulder',
				buttons: [
					{ name: 'buttonL', display: 'L' },
					{ name: 'buttonR', display: 'R' },
					{ name: 'buttonZL', display: 'ZL' },
					{ name: 'buttonZR', display: 'ZR' }
				]
			},
			{
				title: 'Sticks',
				buttons: [
					{ name: 'buttonThumbL', display: 'L3' },
					{ name: 'buttonThumbR', display: 'R3' }
				]
			}
		];

		// Create button grid
		const buttonGrid = document.createElement('div');
		buttonGrid.className = 'turbo-button-grid';

		buttonGroups.forEach(group => {
			const groupDiv = document.createElement('div');

			const groupTitle = document.createElement('p');
			groupTitle.textContent = group.title;
			groupDiv.appendChild(groupTitle);

			const groupButtons = document.createElement('div');

			group.buttons.forEach(button => {
				const buttonLabel = document.createElement('label');

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.checked = this.turboButtons.has(button.name);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.executeAction('addButton', { buttonName: button.name });
					} else {
						this.executeAction('removeButton', { buttonName: button.name });
					}
				});

				// Store reference to checkbox
				this._buttonCheckboxes.set(button.name, checkbox);

				const labelText = document.createElement('span');
				labelText.textContent = button.display;

				buttonLabel.appendChild(checkbox);
				buttonLabel.appendChild(labelText);
				groupButtons.appendChild(buttonLabel);
			});

			groupDiv.appendChild(groupButtons);
			buttonGrid.appendChild(groupDiv);
		});

		buttonsDiv.appendChild(buttonsLabel);
		buttonsDiv.appendChild(buttonGrid);

		// Quick action buttons
		const quickActions = document.createElement('div');
		quickActions.className = 'quick-actions';

		const selectAllBtn = document.createElement('button');
		selectAllBtn.textContent = 'Select All';
		selectAllBtn.className = 'button small';
		selectAllBtn.addEventListener('click', () => {
			this.executeAction('enableAll');
		});

		const clearAllBtn = document.createElement('button');
		clearAllBtn.textContent = 'Clear All';
		clearAllBtn.className = 'button small';
		clearAllBtn.addEventListener('click', () => {
			this.executeAction('clearButtons');
		});

		quickActions.appendChild(selectAllBtn);
		quickActions.appendChild(clearAllBtn);

		// Assemble the UI
		container.appendChild(frequencyDiv);
		container.appendChild(buttonsDiv);
		container.appendChild(quickActions);

		const style = document.createElement('style');
		style.textContent = `
			.turbo-button-grid {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 8px;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		return {
			turboButtons: Array.from(this.turboButtons),
			frequency: this.frequency
		};
	}

	_setSpecificConfig(config) {
		if (config.turboButtons !== undefined) {
			this.turboButtons = new Set(config.turboButtons);
			// Update checkboxes if UI exists
			this._buttonCheckboxes.forEach((checkbox, buttonName) => {
				checkbox.checked = this.turboButtons.has(buttonName);
			});
		}

		if (config.frequency !== undefined) {
			this.frequency = config.frequency;
			this.period = 1000 / this.frequency;
			if (this._freqInput) {
				this._freqInput.value = this.frequency;
			}
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Clear all timers when disabled
			this.timers.clear();
		}
	}

	onDetach() {
		super.onDetach();
		this.timers.clear();
	}

	dispose() {
		super.dispose();
		this.timers.clear();
		this._buttonCheckboxes.clear();
		this._freqInput = null;
	}
}