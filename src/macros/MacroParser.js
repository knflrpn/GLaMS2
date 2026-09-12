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
		const rawLines = scriptText.split('\n');

		// The stack keeps track of our nested blocks. 
		// The bottom of the stack is always the 'root' of the document.
		const stack = [{ type: 'root', children: [] }];

		// Pass 1: Build the Abstract Syntax Tree (AST)
		for (let i = 0; i < rawLines.length; i++) {
			let line = rawLines[i];

			// Strip comments starting with ';'
			const commentIndex = line.indexOf(';');
			if (commentIndex !== -1) {
				line = line.substring(0, commentIndex);
			}

			line = line.trim();

			// Skip completely blank lines or lines that were only comments
			if (line.length === 0) {
				continue;
			}

			// 1. Check for loop start label (e.g., <foobar>)
			const labelMatch = line.match(/^<([^>]+)>$/);
			if (labelMatch) {
				// Push a new loop block onto the stack
				stack.push({
					type: 'loop',
					label: labelMatch[1],
					lineNum: i + 1,
					children: []
				});
				continue;
			}

			// 2. Check for loop end / jump (e.g., @foobar 5)
			const jumpMatch = line.match(/^@(\S+)\s+(\d+)$/);
			if (jumpMatch) {
				const targetLabel = jumpMatch[1];
				const count = parseInt(jumpMatch[2], 10);

				if (stack.length <= 1) {
					throw new Error(`Line ${i + 1}: Jump to '${targetLabel}' without a matching preceding label`);
				}

				// Pop the current loop block to close it
				const currentLoop = stack.pop();

				// This catches interleaved or unclosed loops immediately
				if (currentLoop.label !== targetLabel) {
					throw new Error(`Line ${i + 1}: Mismatched loop label. Expected '@${currentLoop.label}', found '@${targetLabel}'`);
				}

				currentLoop.count = count;

				// Append the closed loop block to its parent's children
				stack[stack.length - 1].children.push(currentLoop);
				continue;
			}

			// 3. Standard command line
			stack[stack.length - 1].children.push({
				type: 'line',
				text: line,
				lineNum: i + 1
			});
		}

		// If there is more than just the 'root' left, a loop wasn't closed
		if (stack.length > 1) {
			const unclosed = stack.pop();
			throw new Error(`Line ${unclosed.lineNum}: Unclosed loop label '<${unclosed.label}>'`);
		}

		// Pass 2: Evaluate the AST into a flat array of frames
		const evaluateNode = (node) => {
			const result = [];

			if (node.type === 'root') {
				for (const child of node.children) {
					// Use a loop instead of the spread operator (...) to prevent stack overflow
					const childFrames = evaluateNode(child);
					for (let j = 0; j < childFrames.length; j++) {
						result.push(childFrames[j]);
					}
				}
			}
			else if (node.type === 'loop') {
				// Evaluate the inner body once
				const loopBody = [];
				for (const child of node.children) {
					const childFrames = evaluateNode(child);
					for (let j = 0; j < childFrames.length; j++) {
						loopBody.push(childFrames[j]);
					}
				}

				// Repeat the evaluated body 'count' times
				for (let c = 0; c < node.count; c++) {
					for (let j = 0; j < loopBody.length; j++) {
						// Create a deep copy of the state for each frame
						result.push(loopBody[j].clone());
					}
				}
			}
			else if (node.type === 'line') {
				try {
					const parsedFrames = this.parseLine(node.text);
					for (let j = 0; j < parsedFrames.length; j++) {
						result.push(parsedFrames[j]);
					}
				} catch (error) {
					throw new Error(`Line ${node.lineNum}: ${error.message}`);
				}
			}

			return result;
		};

		return evaluateNode(stack[0]);
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
		let remainingText = line;

		// Parse buttons like {A B X Y}
		const buttonMatch = remainingText.match(/\{([^}]*)\}/);
		if (buttonMatch) {
			const buttonString = buttonMatch[1].trim();
			if (buttonString) {
				const buttons = buttonString.split(/\s+/);
				this.applyButtons(state, buttons);
			}
			// Remove the matched button segment to track leftover formatting
			remainingText = remainingText.replace(buttonMatch[0], '');
		}

		// Parse exact centered 12-bit raw hardware values [[x y x y]], optional commas
		const rawAnalogMatch = remainingText.match(/\[\[([^\]]*)\]\]/);
		if (rawAnalogMatch) {
			const rawString = rawAnalogMatch[1].replace(/,/g, ' ').trim();
			if (rawString) {
				const values = rawString.split(/\s+/).map(v => parseInt(v, 10));

				if (values.length !== 4) {
					throw new Error('Raw analog values must have exactly 4 numbers: [[leftX leftY rightX rightY]]');
				}

				for (const value of values) {
					if (isNaN(value) || value < -2048 || value > 2047) {
						throw new Error('Raw analog values must be integers between -2048 and 2047');
					}
				}

				// Populate exact raw state and flag it as active
				state.rawAnalog.active = true;
				state.rawAnalog.leftX = values[0];
				state.rawAnalog.leftY = values[1];
				state.rawAnalog.rightX = values[2];
				state.rawAnalog.rightY = values[3];
			}
			// Remove the matched raw analog segment
			remainingText = remainingText.replace(rawAnalogMatch[0], '');
		}

		// Parse analog values [x y x y], optional commas
		const analogMatch = remainingText.match(/\[([^\]]*)\]/);
		if (analogMatch) {
			// Using regex /,/g to ensure all commas are replaced, not just the first one
			const analogString = analogMatch[1].replace(/,/g, ' ').trim();
			if (analogString) {
				const values = analogString.split(/\s+/).map(v => parseFloat(v));
				if (values.length !== 4) {
					throw new Error('Analog values must have exactly 4 numbers: [leftX leftY rightX rightY]');
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
			// Remove the matched analog segment to track leftover formatting
			remainingText = remainingText.replace(analogMatch[0], '');
		}

		// Parse legacy analog values (x y x y) or (x y), optional commas
		const legacyAnalogMatch = remainingText.match(/\(([^)]*)\)/);
		if (legacyAnalogMatch) {
			const legacyString = legacyAnalogMatch[1].replace(/,/g, ' ').trim();
			if (legacyString) {
				const values = legacyString.split(/\s+/).map(v => parseInt(v, 10));

				if (values.length !== 2 && values.length !== 4) {
					throw new Error('Legacy analog values must have exactly 2 or 4 numbers: (leftX leftY [rightX rightY])');
				}

				for (const value of values) {
					if (isNaN(value) || value < 0 || value > 255) {
						throw new Error('Legacy analog values must be integers between 0 and 255');
					}
				}

				// Helper to map [0, 255] (neutral 128) to [-1.0, 1.0] (neutral 0)
				const normalize = (v) => Math.max(-1, Math.min(1, (v - 128) / 127));

				state.analog.leftX = normalize(values[0]);
				state.analog.leftY = normalize(values[1]);

				if (values.length === 4) {
					state.analog.rightX = normalize(values[2]);
					state.analog.rightY = normalize(values[3]);
				} else {
					// Default missing right stick values to neutral (0 in the [-1, 1] system)
					state.analog.rightX = 0;
					state.analog.rightY = 0;
				}
			}
			// Remove the matched legacy analog segment
			remainingText = remainingText.replace(legacyAnalogMatch[0], '');
		}

		// If there is any leftover text that wasn't a valid component, throw an error
		remainingText = remainingText.trim();
		if (remainingText.length > 0) {
			throw new Error(`Invalid syntax or unexpected text: '${remainingText}'`);
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