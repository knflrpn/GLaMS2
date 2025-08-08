/**
 * /src/macros/MacroParser.js
 * 
 * Handles parsing of macro script text into ControllerState objects.
 */

import { ControllerState } from '../core/ControllerState.js';

export class MacroParser {
	/**
	 * Parse a macro script text into an array of ControllerState frames.
	 * @param {string} scriptText - The macro script text
	 * @returns {ControllerState[]} Array of controller states
	 * @throws {Error} If parsing fails
	 */
	static parseScript(scriptText) {
		const lines = scriptText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
		const frames = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			try {
				const frame = this.parseLine(line);
				frames.push(frame);
			} catch (error) {
				throw new Error(`Line ${i + 1}: ${error.message}`);
			}
		}

		return frames;
	}

	/**
	 * Parse a single line of macro script into a ControllerState.
	 * @param {string} line - A single line from the macro script
	 * @returns {ControllerState} The parsed controller state
	 * @throws {Error} If line parsing fails
	 */
	static parseLine(line) {
		const state = new ControllerState();

		// Parse buttons {A B X Y}
		const buttonMatch = line.match(/\{([^}]*)\}/);
		if (buttonMatch) {
			const buttonString = buttonMatch[1].trim();
			if (buttonString) {
				const buttons = buttonString.split(/\s+/);
				this.applyButtons(state, buttons);
			}
		}

		// Parse analog values [x, y, x, y]
		const analogMatch = line.match(/\[([^\]]*)\]/);
		if (analogMatch) {
			const analogString = analogMatch[1].trim();
			if (analogString) {
				const values = analogString.split(',').map(v => parseFloat(v.trim()));
				if (values.length !== 4) {
					throw new Error('Analog values must have exactly 4 numbers: [leftX, leftY, rightX, rightY]');
				}

				for (const value of values) {
					if (isNaN(value) || value < -1 || value > 1) {
						throw new Error('Analog values must be numbers between -1.0 and 1.0');
					}
				}

				state.analog.leftX = values[0];
				state.analog.leftY = values[1];
				state.analog.rightX = values[2];
				state.analog.rightY = values[3];
			}
		}

		return state;
	}

	/**
	 * Apply button states to a ControllerState object.
	 * @param {ControllerState} state - The controller state to modify
	 * @param {string[]} buttons - Array of button names to set as pressed
	 * @throws {Error} If an unknown button name is encountered
	 */
	static applyButtons(state, buttons) {
		const buttonMap = {
			'A': 'buttonA',
			'B': 'buttonB',
			'X': 'buttonX',
			'Y': 'buttonY',
			'U': 'dpadUp',
			'D': 'dpadDown',
			'L': 'dpadLeft',
			'R': 'dpadRight',
			'h': 'buttonHome',
			'c': 'buttonCapture',
			'+': 'buttonPlus',
			'-': 'buttonMinus',
			'L1': 'buttonL',
			'L2': 'buttonZL',
			'L3': 'buttonThumbL',
			'R1': 'buttonR',
			'R2': 'buttonZR',
			'R3': 'buttonThumbR'
		};

		for (const button of buttons) {
			const stateKey = buttonMap[button];
			if (!stateKey) {
				throw new Error(`Unknown button: ${button}`);
			}
			state.digital[stateKey] = true;
		}
	}

	/**
	 * Get a list of all supported button names for documentation.
	 * @returns {Object} Object with button categories and their names
	 */
	static getSupportedButtons() {
		return {
			standard: ['A', 'B', 'X', 'Y'],
			dpad: ['U', 'D', 'L', 'R'],
			special: ['h', 'c', '+', '-'],
			shoulders: ['L1', 'L2', 'L3', 'R1', 'R2', 'R3']
		};
	}

	/**
	 * Generate an example macro script.
	 * @returns {string} Example macro script text
	 */
	static getExampleScript() {
		return `{A} [0.0, 0.0, 0.0, 0.0]
{} [0.0, 0.0, 0.0, 0.0]
{} [0.0, 0.0, 0.0, 0.0]
{B} [0.5, 0.0, 0.0, 0.0]
{} [0.0, 0.0, 0.0, 0.0]
{X Y} [-1.0, 1.0, 0.0, 0.0]
{} [0.0, 0.0, 0.0, 0.0]
{U L1} [0.0, 0.0, 0.5, -0.5]
{} [0.0, 0.0, 0.0, 0.0]
{+ -} [0.0, 0.0, 0.0, 0.0]`;
	}
}