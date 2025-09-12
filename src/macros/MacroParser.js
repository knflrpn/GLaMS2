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
				const parsedFrames = this.parseLine(line);
				frames.push(...parsedFrames);
			} catch (error) {
				throw new Error(`Line ${i + 1}: ${error.message}`);
			}
		}

		return frames;
	}

	/**
	 * Parse a single line of macro script into one or more ControllerState frames.
	 * @param {string} line - A single line from the macro script
	 * @returns {ControllerState[]} Array of controller states (repeated if specified)
	 * @throws {Error} If line parsing fails
	 */
	static parseLine(line) {
		// Extract frame count from the end of the line (if present)
		const frameCountMatch = line.match(/^(.+?)\s*(\d+)\s*$/);
		let frameCount = 1;
		let contentLine = line;

		if (frameCountMatch) {
			contentLine = frameCountMatch[1].trim();
			frameCount = parseInt(frameCountMatch[2], 10);

			if (frameCount <= 0) {
				throw new Error('Frame count must be a positive integer');
			}
			if (frameCount > 600) {
				throw new Error('Frame count per line cannot exceed 600');
			}
		}

		// Parse the controller state from the content
		const state = this.parseControllerState(contentLine);

		// Create array of repeated frames
		const frames = [];
		for (let i = 0; i < frameCount; i++) {
			// Create a deep copy of the state for each frame
			frames.push(state.clone());
		}

		return frames;
	}

	/**
	 * Parse controller state from a line (without frame count).
	 * @param {string} line - Line content without frame count
	 * @returns {ControllerState} The parsed controller state
	 * @throws {Error} If parsing fails
	 */
	static parseControllerState(line) {
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

}