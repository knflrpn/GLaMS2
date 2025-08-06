/**
 * ./src/manipulators/Cooldown.js
 *
 * Manipulator that adds cooldown to gamepad actions.
 * Buttons: Can be held but can't be re-pressed until cooldown expires after release.
 * Sticks: Ratchet system that limits maximum movement based on previous peaks.
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} CooldownParams
 * @property {number} [buttonCooldown=500] - Button cooldown time in milliseconds
 * @property {number} [stickCooldown=1000] - Stick ratchet cooldown time in milliseconds
 * @property {string[]} [cooldownButtons=[]] - Array of button names to apply cooldown to
 * @property {boolean} [enableLeftStick=true] - Enable left stick ratchet
 * @property {boolean} [enableRightStick=true] - Enable right stick ratchet
 */

export class Cooldown extends BaseManipulator {
	static get defaultConfig() {
		return {
			buttonCooldown: 500,
			stickCooldown: 1000,
			cooldownButtons: [],
			enableLeftStick: true,
			enableRightStick: true,
		};
	}

	static get displayName() {
		return "Cooldown";
	}

	static get description() {
		return "Add cooldown to buttons and ratchet limits to analog sticks.";
	}

	/**
	 * @param {CooldownParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.buttonCooldown = params.buttonCooldown ?? 500;
		this.stickCooldown = params.stickCooldown ?? 1000;
		this.cooldownButtons = new Set(params.cooldownButtons || 
			["buttonA", "buttonB", "buttonX", "buttonY", "buttonL", 
				"buttonR", "buttonZL", "buttonZR", "dpadUp", "dpadDown", 
				"dpadLeft", "dpadRight", "buttonThumbL", "buttonThumbR"]);
		this.enableLeftStick = params.enableLeftStick ?? true;
		this.enableRightStick = params.enableRightStick ?? true;
		this.stickThreshold = 0.1;

		// Button state tracking
		this.buttonStates = new Map(); // buttonName -> { pressed: bool, cooldownTimer: number }

		// Stick ratchet state tracking
		this.stickStates = {
			left: {
				xPos: { peak: 0, wall: 1, cooldownTimer: 0 },
				xNeg: { peak: 0, wall: 1, cooldownTimer: 0 },
				yPos: { peak: 0, wall: 1, cooldownTimer: 0 },
				yNeg: { peak: 0, wall: 1, cooldownTimer: 0 }
			},
			right: {
				xPos: { peak: 0, wall: 1, cooldownTimer: 0 },
				xNeg: { peak: 0, wall: 1, cooldownTimer: 0 },
				yPos: { peak: 0, wall: 1, cooldownTimer: 0 },
				yNeg: { peak: 0, wall: 1, cooldownTimer: 0 }
			}
		};

		// UI elements
		this._buttonCooldownInput = null;
		this._stickCooldownInput = null;
		this._leftStickCheckbox = null;
		this._rightStickCheckbox = null;
		this._buttonCheckboxes = new Map();

		// Register cooldown-specific actions
		this._registerCooldownActions();
	}

	/**
	 * Register actions specific to the cooldown manipulator
	 */
	_registerCooldownActions() {
		this.registerAction({
			name: 'setButtonCooldown',
			displayName: 'Set Button Cooldown',
			description: 'Set the button cooldown time in milliseconds',
			parameters: [
				{
					name: 'cooldown',
					type: 'number',
					description: 'Cooldown time in milliseconds (50-5000)',
					required: true,
					default: 500
				}
			],
			handler: (params) => this.setButtonCooldown(params.cooldown)
		});

		this.registerAction({
			name: 'setStickCooldown',
			displayName: 'Set Stick Cooldown',
			description: 'Set the stick ratchet cooldown time in milliseconds',
			parameters: [
				{
					name: 'cooldown',
					type: 'number',
					description: 'Cooldown time in milliseconds (100-10000)',
					required: true,
					default: 1000
				}
			],
			handler: (params) => this.setStickCooldown(params.cooldown)
		});

		this.registerAction({
			name: 'setLeftStickEnabled',
			displayName: 'Enable Left Stick',
			description: 'Enable/disable left stick ratchet',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Enable left stick ratchet',
					required: true
				}
			],
			handler: (params) => this.setLeftStickEnabled(params.enabled)
		});

		this.registerAction({
			name: 'setRightStickEnabled',
			displayName: 'Enable Right Stick',
			description: 'Enable/disable right stick ratchet',
			parameters: [
				{
					name: 'enabled',
					type: 'boolean',
					description: 'Enable right stick ratchet',
					required: true
				}
			],
			handler: (params) => this.setRightStickEnabled(params.enabled)
		});

		this.registerAction({
			name: 'addButton',
			displayName: 'Add Cooldown Button',
			description: 'Add a button to the cooldown list',
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
			displayName: 'Remove Cooldown Button',
			description: 'Remove a button from the cooldown list',
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
			name: 'clearButtons',
			displayName: 'Clear All Cooldown Buttons',
			description: 'Remove all buttons from the cooldown list',
			handler: () => this.clearButtons()
		});

		this.registerAction({
			name: 'resetStickRatchets',
			displayName: 'Reset Stick Ratchets',
			description: 'Reset all stick ratchet walls to maximum',
			handler: () => this.resetStickRatchets()
		});
	}

	/**
	 * Set the button cooldown time
	 * @param {number} cooldown - Cooldown time in milliseconds
	 */
	setButtonCooldown(cooldown) {
		this.buttonCooldown = Math.max(50, Math.min(5000, cooldown));
		if (this._buttonCooldownInput) {
			this._buttonCooldownInput.value = this.buttonCooldown;
		}
		this.log(`Button cooldown set to ${this.buttonCooldown}ms`);
		return this.buttonCooldown;
	}

	/**
	 * Set the stick cooldown time
	 * @param {number} cooldown - Cooldown time in milliseconds
	 */
	setStickCooldown(cooldown) {
		this.stickCooldown = Math.max(100, Math.min(10000, cooldown));
		if (this._stickCooldownInput) {
			this._stickCooldownInput.value = this.stickCooldown;
		}
		this.log(`Stick cooldown set to ${this.stickCooldown}ms`);
		return this.stickCooldown;
	}

	/**
	 * Set left stick enabled state
	 * @param {boolean} enabled
	 */
	setLeftStickEnabled(enabled) {
		this.enableLeftStick = enabled;
		if (this._leftStickCheckbox) {
			this._leftStickCheckbox.checked = enabled;
		}
		this.log(`Left stick ratchet ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Set right stick enabled state
	 * @param {boolean} enabled
	 */
	setRightStickEnabled(enabled) {
		this.enableRightStick = enabled;
		if (this._rightStickCheckbox) {
			this._rightStickCheckbox.checked = enabled;
		}
		this.log(`Right stick ratchet ${enabled ? 'enabled' : 'disabled'}`);
		return enabled;
	}

	/**
	 * Add a button to the cooldown list
	 * @param {string} buttonName
	 */
	addButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		this.cooldownButtons.add(buttonName);

		// Initialize button state if not exists
		if (!this.buttonStates.has(buttonName)) {
			this.buttonStates.set(buttonName, { pressed: false, cooldownTimer: 0 });
		}

		// Update UI if it exists
		const checkbox = this._buttonCheckboxes.get(buttonName);
		if (checkbox) {
			checkbox.checked = true;
		}

		this.log(`Added cooldown to ${buttonName}`);
		return true;
	}

	/**
	 * Remove a button from the cooldown list
	 * @param {string} buttonName
	 */
	removeButton(buttonName) {
		if (!buttonName) {
			throw new Error('Button name is required');
		}

		const removed = this.cooldownButtons.delete(buttonName);
		if (removed) {
			this.buttonStates.delete(buttonName);

			// Update UI if it exists
			const checkbox = this._buttonCheckboxes.get(buttonName);
			if (checkbox) {
				checkbox.checked = false;
			}

			this.log(`Removed cooldown from ${buttonName}`);
		}

		return removed;
	}

	/**
	 * Clear all cooldown buttons
	 */
	clearButtons() {
		this.cooldownButtons.clear();
		this.buttonStates.clear();

		// Update UI
		this._buttonCheckboxes.forEach(checkbox => {
			checkbox.checked = false;
		});

		this.log('Cleared all cooldown buttons');
		return true;
	}

	/**
	 * Reset all stick ratchet walls to maximum
	 */
	resetStickRatchets() {
		Object.values(this.stickStates).forEach(stick => {
			Object.values(stick).forEach(direction => {
				direction.peak = 0;
				direction.wall = 1;
				direction.cooldownTimer = 0;
			});
		});

		this.log('Reset all stick ratchets');
		return true;
	}

	/**
	 * Process stick ratchet for a single direction
	 * @param {Object} directionState - The direction state object
	 * @param {number} currentValue - Current stick value for this direction (0-1)
	 * @param {number} deltaTime - Time delta in milliseconds
	 * @returns {number} - Modified stick value
	 */
	_processStickDirection(directionState, currentValue, deltaTime) {
		// Update cooldown timer
		if (directionState.cooldownTimer > 0) {
			directionState.cooldownTimer -= deltaTime;
			if (directionState.cooldownTimer <= 0) {
				// Cooldown expired, reset ratchet and wall
				directionState.peak = 0;
				directionState.wall = 1;
				directionState.cooldownTimer = 0;
			}
		}

		// Apply wall limitation
		currentValue = Math.min(currentValue, directionState.wall);

		// Check for next ratchet step
		if ((currentValue - directionState.peak) > this.stickThreshold) {
			directionState.peak += this.stickThreshold;
			// Set cooldown timer
			directionState.cooldownTimer = this.stickCooldown;
		
		}
		// Check for moving back down
		else if ((directionState.peak - currentValue) > this.stickThreshold) {
			directionState.peak -= this.stickThreshold;
			directionState.wall -= this.stickThreshold;
		}

		// Apply wall limitation
		return Math.min(currentValue, directionState.wall);
	}

	_processInternal(state, deltaTime) {
		// Process button cooldowns
		for (const buttonName of this.cooldownButtons) {
			if (!(buttonName in state.digital)) continue;

			// Initialize button state if needed
			if (!this.buttonStates.has(buttonName)) {
				this.buttonStates.set(buttonName, { pressed: false, cooldownTimer: 0 });
			}

			const buttonState = this.buttonStates.get(buttonName);
			const currentPressed = state.digital[buttonName];

			// Update cooldown timer
			if (buttonState.cooldownTimer > 0) {
				buttonState.cooldownTimer -= deltaTime;
			}

			if (currentPressed) {
				if (!buttonState.pressed) {
					// Button just pressed
					if (buttonState.cooldownTimer <= 0) {
						// Not in cooldown, allow press
						buttonState.pressed = true;
						// But start cooldown
						buttonState.cooldownTimer = this.buttonCooldown;
						// Don't modify the button state, let it through
					} else {
						// Still in cooldown, block the press
						state.digital[buttonName] = false;
					}
				}
				// If already pressed, keep it pressed (allow holding)
			} else {
				buttonState.pressed = false;
			}
		}

		// Process left stick ratchet
		if (this.enableLeftStick) {
			const leftX = state.analog.leftX;
			const leftY = state.analog.leftY;

			// Process X axis directions
			const leftXPos = Math.max(0, leftX);
			const leftXNeg = Math.max(0, -leftX);
			const leftYPos = Math.max(0, leftY);
			const leftYNeg = Math.max(0, -leftY);

			const newXPos = this._processStickDirection(this.stickStates.left.xPos, leftXPos, deltaTime);
			const newXNeg = this._processStickDirection(this.stickStates.left.xNeg, leftXNeg, deltaTime);
			const newYPos = this._processStickDirection(this.stickStates.left.yPos, leftYPos, deltaTime);
			const newYNeg = this._processStickDirection(this.stickStates.left.yNeg, leftYNeg, deltaTime);

			// Reconstruct the stick values
			state.analog.leftX = newXPos - newXNeg;
			state.analog.leftY = newYPos - newYNeg;
		}

		// Process right stick ratchet
		if (this.enableRightStick) {
			const rightX = state.analog.rightX;
			const rightY = state.analog.rightY;

			// Process directions
			const rightXPos = Math.max(0, rightX);
			const rightXNeg = Math.max(0, -rightX);
			const rightYPos = Math.max(0, rightY);
			const rightYNeg = Math.max(0, -rightY);

			const newXPos = this._processStickDirection(this.stickStates.right.xPos, rightXPos, deltaTime);
			const newXNeg = this._processStickDirection(this.stickStates.right.xNeg, rightXNeg, deltaTime);
			const newYPos = this._processStickDirection(this.stickStates.right.yPos, rightYPos, deltaTime);
			const newYNeg = this._processStickDirection(this.stickStates.right.yNeg, rightYNeg, deltaTime);

			// Reconstruct the stick values
			state.analog.rightX = newXPos - newXNeg;
			state.analog.rightY = newYPos - newYNeg;
		}

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls cooldown-custom';

		// Main settings
		const mainControls = document.createElement('div');
		mainControls.className = 'manipulator-control-group';

		// Button cooldown settings
		const buttonDiv = document.createElement('div');

		const buttonCooldownLabel = document.createElement('label');
		buttonCooldownLabel.textContent = 'Button Cooldown (ms): ';

		this._buttonCooldownInput = document.createElement('input');
		this._buttonCooldownInput.type = 'number';
		this._buttonCooldownInput.min = '50';
		this._buttonCooldownInput.max = '5000';
		this._buttonCooldownInput.step = '50';
		this._buttonCooldownInput.value = this.buttonCooldown;
		this._buttonCooldownInput.addEventListener('change', () => {
			const value = parseInt(this._buttonCooldownInput.value) || 500;
			this.executeAction('setButtonCooldown', { cooldown: value });
		});

		buttonCooldownLabel.appendChild(this._buttonCooldownInput);
		buttonDiv.appendChild(buttonCooldownLabel);

		// Stick ratchet settings
		const stickDiv = document.createElement('div');

		const stickCooldownLabel = document.createElement('label');
		stickCooldownLabel.textContent = 'Stick Cooldown (ms): ';

		this._stickCooldownInput = document.createElement('input');
		this._stickCooldownInput.type = 'number';
		this._stickCooldownInput.min = '100';
		this._stickCooldownInput.max = '10000';
		this._stickCooldownInput.step = '100';
		this._stickCooldownInput.value = this.stickCooldown;
		this._stickCooldownInput.addEventListener('change', () => {
			const value = parseInt(this._stickCooldownInput.value) || 1000;
			this.executeAction('setStickCooldown', { cooldown: value });
		});

		stickCooldownLabel.appendChild(this._stickCooldownInput);
		stickDiv.appendChild(stickCooldownLabel);

		// Stick enable checkboxes
		const leftStickLabel = document.createElement('label');
		this._leftStickCheckbox = document.createElement('input');
		this._leftStickCheckbox.type = 'checkbox';
		this._leftStickCheckbox.checked = this.enableLeftStick;
		this._leftStickCheckbox.addEventListener('change', () => {
			this.executeAction('setLeftStickEnabled', { enabled: this._leftStickCheckbox.checked });
		});
		leftStickLabel.appendChild(this._leftStickCheckbox);
		leftStickLabel.appendChild(document.createTextNode(' Left Stick'));

		const rightStickLabel = document.createElement('label');
		this._rightStickCheckbox = document.createElement('input');
		this._rightStickCheckbox.type = 'checkbox';
		this._rightStickCheckbox.checked = this.enableRightStick;
		this._rightStickCheckbox.addEventListener('change', () => {
			this.executeAction('setRightStickEnabled', { enabled: this._rightStickCheckbox.checked });
		});
		rightStickLabel.appendChild(this._rightStickCheckbox);
		rightStickLabel.appendChild(document.createTextNode(' Right Stick'));

		stickDiv.appendChild(leftStickLabel);
		stickDiv.appendChild(rightStickLabel);

		mainControls.appendChild(buttonDiv);
		mainControls.appendChild(stickDiv);

		// Button selection
		const buttonsDiv = document.createElement('div');
		buttonsDiv.className = 'manipulator-control-group';

		const buttonsLabel = document.createElement('p');
		buttonsLabel.textContent = 'Cooldown Buttons:';

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
		buttonGrid.className = 'cooldown-button-grid';

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
				checkbox.checked = this.cooldownButtons.has(button.name);
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

		// Quick actions
		const quickActions = document.createElement('div');
		quickActions.className = 'quick-actions inline-with-gap';

		const clearButtonsBtn = document.createElement('button');
		clearButtonsBtn.textContent = 'Clear Buttons';
		clearButtonsBtn.className = 'button small';
		clearButtonsBtn.addEventListener('click', () => {
			this.executeAction('clearButtons');
		});

		quickActions.appendChild(clearButtonsBtn);

		// Assemble the UI
		container.appendChild(mainControls);
		container.appendChild(buttonsDiv);
		container.appendChild(quickActions);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.cooldown-button-grid {
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
			buttonCooldown: this.buttonCooldown,
			stickCooldown: this.stickCooldown,
			cooldownButtons: Array.from(this.cooldownButtons),
			enableLeftStick: this.enableLeftStick,
			enableRightStick: this.enableRightStick,
		};
	}

	_setSpecificConfig(config) {
		if (config.buttonCooldown !== undefined) {
			this.setButtonCooldown(config.buttonCooldown);
		}

		if (config.stickCooldown !== undefined) {
			this.setStickCooldown(config.stickCooldown);
		}

		if (config.enableLeftStick !== undefined) {
			this.setLeftStickEnabled(config.enableLeftStick);
		}

		if (config.enableRightStick !== undefined) {
			this.setRightStickEnabled(config.enableRightStick);
		}

		if (config.cooldownButtons !== undefined) {
			this.cooldownButtons = new Set(config.cooldownButtons);
			// Update checkboxes if UI exists
			this._buttonCheckboxes.forEach((checkbox, buttonName) => {
				checkbox.checked = this.cooldownButtons.has(buttonName);
			});
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Clear all button states when disabled
			this.buttonStates.clear();
			// Reset stick ratchets
			this.resetStickRatchets();
		}
	}

	onDetach() {
		super.onDetach();
		this.buttonStates.clear();
		this.resetStickRatchets();
	}

	dispose() {
		super.dispose();
		this.buttonStates.clear();
		this._buttonCheckboxes.clear();
		this._buttonCooldownInput = null;
		this._stickCooldownInput = null;
		this._leftStickCheckbox = null;
		this._rightStickCheckbox = null;
	}
}