// GLaMS Roulette Wheel Page
import { ConnectionManager, ROOM_NAME, COLORS, wrapPi } from './glams-roulette-common.js';

// =======================
// ROULETTE WHEEL CLASS
// =======================
class RouletteWheel {
	constructor(canvasId, options = {}) {
		this.canvas = document.getElementById(canvasId);
		this.ctx = this.canvas.getContext('2d');
		this.offscreenCanvas = null;
		this.offscreenCtx = null;
		this.wheelImageCache = null;
		this.lastSegmentsHash = null;
		this.segments = [];
		this.currentIndex = -1;
		this.currentAngle = 0;
		this.spinning = false;
		this.radius = 0;
		this.logicalSize = 1000;

		// Configuration
		this.config = {
			spinMinTurns: options.spinMinTurns || 6,
			spinMaxTurns: options.spinMaxTurns || 9,
			spinDuration: options.spinDuration || 4800,
			labelRotateExtra: options.labelRotateExtra || Math.PI / 2,
			spinEasing: options.spinEasing || (t => 1 - Math.exp(-7 * t))
		};

		// Callbacks
		this.onSpinComplete = options.onSpinComplete || (() => { });
		this.onSegmentsUpdated = options.onSegmentsUpdated || (() => { });

		this.setupCanvas();
		window.addEventListener('resize', () => this.setupCanvas());
	}

	setupCanvas() {
		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const rect = this.canvas.getBoundingClientRect();
		this.canvas.width = Math.round(rect.width * dpr);
		this.canvas.height = Math.round(rect.height * dpr);
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.scale(dpr, dpr);

		this.logicalSize = Math.min(rect.width, rect.height);
		this.radius = this.logicalSize * 0.45;

		// Setup offscreen canvas with same dimensions
		this.setupOffscreenCanvas(rect.width, rect.height, dpr);

		this.drawWheel();
	}

	setupOffscreenCanvas(width, height, dpr) {
		this.offscreenCanvas = document.createElement('canvas');
		this.offscreenCanvas.width = Math.round(width * dpr);
		this.offscreenCanvas.height = Math.round(height * dpr);
		this.offscreenCtx = this.offscreenCanvas.getContext('2d');
		this.offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
		this.offscreenCtx.scale(dpr, dpr);

		// Invalidate cache when canvas size changes
		this.wheelImageCache = null;
		this.lastSegmentsHash = null;
	}

	getSegmentsHash() {
		if (this.segments.length === 0) return 'empty';

		return this.segments.map(seg =>
			`${seg.displayName || ''}`
		).join('|');
	}

	preRenderWheel() {
		if (!this.offscreenCanvas || !this.offscreenCtx) return;

		const w = this.offscreenCanvas.width / (window.devicePixelRatio || 1);
		const h = this.offscreenCanvas.height / (window.devicePixelRatio || 1);
		const cx = w / 2, cy = h / 2;

		// Clear offscreen canvas
		this.offscreenCtx.clearRect(0, 0, w, h);
		this.offscreenCtx.save();
		this.offscreenCtx.translate(cx, cy);

		if (this.segments.length === 0) {
			this.offscreenCtx.restore();
			return;
		}

		const slice = (Math.PI * 2) / this.segments.length;

		// Draw segments without rotation (we'll rotate when drawing to main canvas)
		for (let i = 0; i < this.segments.length; i++) {
			const start = i * slice - Math.PI / 2;
			const end = start + slice;

			// Fill
			this.offscreenCtx.beginPath();
			this.offscreenCtx.moveTo(0, 0);
			this.offscreenCtx.arc(0, 0, this.radius, start, end);
			this.offscreenCtx.closePath();
			this.offscreenCtx.fillStyle = COLORS[i % COLORS.length];
			this.offscreenCtx.fill();

			// Separator
			this.offscreenCtx.strokeStyle = 'rgba(255,255,255,.35)';
			this.offscreenCtx.lineWidth = 2;
			this.offscreenCtx.beginPath();
			this.offscreenCtx.moveTo(0, 0);
			this.offscreenCtx.lineTo(Math.cos(start) * this.radius, Math.sin(start) * this.radius);
			this.offscreenCtx.stroke();

			// Text
			const label = (this.segments[i].displayName ?? '').toString();
			if (label) {
				const mid = start + slice / 2;
				this.offscreenCtx.save();
				const textRadius = this.radius * 0.95;
				this.offscreenCtx.translate(Math.cos(mid) * textRadius, Math.sin(mid) * textRadius);
				this.offscreenCtx.rotate(mid + Math.PI / 2 + this.config.labelRotateExtra);

				this.offscreenCtx.textAlign = 'start';
				this.offscreenCtx.textBaseline = 'middle';



				const maxTextWidth = this.radius * 0.8; // Available width for text
				const baseSize = Math.max(14, Math.min(20, this.radius * 0.06));
				let fontSize = baseSize;
				let displayText = label;

				// Measure and scale down if needed
				this.offscreenCtx.font = `400 ${fontSize}px Inter, ui-sans-serif`;
				let textWidth = this.offscreenCtx.measureText(displayText).width;

				while (textWidth > maxTextWidth && fontSize > 14) {
					fontSize -= 1;
					this.offscreenCtx.font = `400 ${fontSize}px Inter, ui-sans-serif`;
					textWidth = this.offscreenCtx.measureText(displayText).width;
				}

				// If we've hit the minimum font size and text is still too wide, truncate
				if (textWidth > maxTextWidth && fontSize <= 14) {
					// Binary search for the optimal truncation point
					let left = 0;
					let right = label.length;
					let bestLength = 0;

					while (left <= right) {
						const mid = Math.floor((left + right) / 2);
						const testText = label.substring(0, mid) + (mid < label.length ? '…' : '');
						const testWidth = this.offscreenCtx.measureText(testText).width;

						if (testWidth <= maxTextWidth) {
							bestLength = mid;
							left = mid + 1;
						} else {
							right = mid - 1;
						}
					}

					displayText = bestLength > 0 ?
						label.substring(0, bestLength) + (bestLength < label.length ? '…' : '') :
						'…';
				}



				this.offscreenCtx.lineWidth = 4;
				this.offscreenCtx.strokeStyle = 'rgba(0,0,0,.8)';
				this.offscreenCtx.strokeText(displayText, 0, 0);
				this.offscreenCtx.fillStyle = '#fff';
				this.offscreenCtx.fillText(displayText, 0, 0);
				this.offscreenCtx.restore();
			}
		}

		// Rim
		this.offscreenCtx.beginPath();
		this.offscreenCtx.arc(0, 0, this.radius, 0, Math.PI * 2);
		this.offscreenCtx.lineWidth = 10;
		this.offscreenCtx.strokeStyle = 'rgba(255,255,255,.85)';
		this.offscreenCtx.stroke();

		this.offscreenCtx.restore();
	}

	shuffleArray(array) {
		const shuffled = [...array]; // Create a copy to avoid mutating the original
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	loadSegments(segmentsData) {
		// Shuffle the segments before loading them
		this.segments = segmentsData && segmentsData.length > 0 ?
			this.shuffleArray(segmentsData) : [];

		const hasSegments = this.segments.length > 0;

		if (hasSegments) {
			this.currentIndex = 0;

			// Calculate the angle to position the first segment at the pointer (-π/2)
			const TWO_PI = Math.PI * 2;
			const sliceSize = TWO_PI / this.segments.length;

			// The center angle of the first segment (index 0) in wheel coordinates
			const firstSegmentCenterAngle = 0 * sliceSize + sliceSize / 2; // This is just sliceSize / 2

			// Set the angle so the first segment's center aligns with the pointer at -π/2
			this.currentAngle = -Math.PI / 2 - firstSegmentCenterAngle;
		} else {
			this.currentIndex = -1;
			this.currentAngle = 0; // Reset angle when no segments
		}

		// Invalidate cache when segments change
		this.wheelImageCache = null;
		this.lastSegmentsHash = null;

		this.onSegmentsUpdated(this.segments, hasSegments);
		this.drawWheel();
		return hasSegments;
	}

	drawWheel() {
		const w = this.canvas.getBoundingClientRect().width;
		const h = this.canvas.getBoundingClientRect().height;
		const cx = w / 2, cy = h / 2;

		// Clear main canvas
		this.ctx.clearRect(0, 0, w, h);
		this.ctx.save();
		this.ctx.translate(cx, cy);

		// Draw glow ring (this is dynamic and cheap to render)
		this.ctx.beginPath();
		this.ctx.arc(0, 0, this.radius + 14, 0, Math.PI * 2);
		const g1 = this.ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + 40);
		g1.addColorStop(0, 'rgba(255,255,255,0)');
		g1.addColorStop(1, 'rgba(255,255,255,0.09)');
		this.ctx.fillStyle = g1;
		this.ctx.fill();

		if (this.segments.length === 0) {
			this.ctx.restore();
			return;
		}

		// Check if we need to regenerate the cached wheel image
		const currentHash = this.getSegmentsHash();
		if (!this.wheelImageCache || this.lastSegmentsHash !== currentHash) {
			this.preRenderWheel();
			this.wheelImageCache = this.offscreenCanvas;
			this.lastSegmentsHash = currentHash;
		}

		// Draw the cached wheel image with rotation
		if (this.wheelImageCache) {
			this.ctx.rotate(this.currentAngle);
			this.ctx.drawImage(
				this.wheelImageCache,
				-cx, -cy, // Draw centered
				w, h
			);
		}

		this.ctx.restore();
	}

	flashRing() {
		const w = this.canvas.getBoundingClientRect().width;
		const h = this.canvas.getBoundingClientRect().height;
		const cx = w / 2, cy = h / 2;
		const maxR = this.radius + 18;
		let alpha = 0.6;

		const step = () => {
			alpha -= 0.04;
			if (alpha <= 0) {
				this.drawWheel();
				return;
			}
			this.drawWheel();
			this.ctx.save();
			this.ctx.translate(cx, cy);
			this.ctx.beginPath();
			this.ctx.arc(0, 0, maxR, 0, Math.PI * 2);
			this.ctx.lineWidth = 10;
			this.ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
			this.ctx.stroke();
			this.ctx.restore();
			requestAnimationFrame(step);
		};
		step();
	}

	spin() {
		if (this.spinning || this.segments.length === 0) return false;

		this.spinning = true;

		// Preselect winner
		const winnerIndex = Math.floor(Math.random() * this.segments.length);
		const TWO_PI = Math.PI * 2;
		const slice = TWO_PI / this.segments.length;

		// Winner center in wheel coordinates
		const winnerCenterAngle = winnerIndex * slice + slice / 2;

		// Base: land with winner at left (-π/2)
		const extraTurns = this.config.spinMinTurns + Math.random() * (this.config.spinMaxTurns - this.config.spinMinTurns);
		let target = this.currentAngle + (-Math.PI / 2 - winnerCenterAngle) + TWO_PI * extraTurns;

		// Small visual jitter, then exact correction
		const jitter = (Math.random() - 0.5) * (slice * 0.12);
		target += jitter;

		// Exact correction for perfect alignment
		const misalign = wrapPi((winnerCenterAngle + target) - (-Math.PI / 2));
		target -= misalign;

		const start = this.currentAngle;
		const delta = target - start;
		const t0 = performance.now();

		const animate = (now) => {
			const t = Math.min(1, (now - t0) / this.config.spinDuration);
			const eased = this.config.spinEasing(t);
			this.currentAngle = start + delta * eased;
			this.drawWheel();

			if (t < 1) {
				requestAnimationFrame(animate);
			} else {
				// Snap to exact final angle
				this.currentAngle = target;
				this.drawWheel();
				this.currentIndex = winnerIndex;
				this.spinning = false;
				this.flashRing();
				this.onSpinComplete(winnerIndex, this.segments[winnerIndex]);
			}
		};
		requestAnimationFrame(animate);
		return true;
	}

	removeCurrentSegment() {
		if (this.spinning || this.segments.length === 0 || this.currentIndex < 0) return false;

		// Store the current index before removal
		const removedIndex = this.currentIndex;

		// Remove the segment
		this.segments.splice(this.currentIndex, 1);

		if (this.segments.length === 0) {
			this.currentIndex = -1;
			this.onSegmentsUpdated(this.segments, false);
			this.drawWheel();
			return true;
		}

		// Calculate new currentIndex after removal
		if (removedIndex >= this.segments.length) {
			// If we removed the last segment, wrap to the first
			this.currentIndex = 0;
		} else {
			// The segment that was after the removed one is now at the same index
			this.currentIndex = removedIndex;
		}

		// Calculate the angle to position the new current segment at the pointer (-π/2)
		const TWO_PI = Math.PI * 2;
		const sliceSize = TWO_PI / this.segments.length;

		// The center angle of the current segment in wheel coordinates
		const currentSegmentCenterAngle = this.currentIndex * sliceSize + sliceSize / 2;

		// Set the angle so this segment's center aligns with the pointer at -π/2
		this.currentAngle = -Math.PI / 2 - currentSegmentCenterAngle;

		// Invalidate cache when segments change
		this.wheelImageCache = null;
		this.lastSegmentsHash = null;

		this.onSegmentsUpdated(this.segments, true);
		this.drawWheel();
		return true;
	}

	getCurrentSegment() {
		return this.currentIndex >= 0 ? this.segments[this.currentIndex] : null;
	}

	moveNPlaces(n, duration = 500) {
		// Return false if wheel is spinning or no segments
		if (this.spinning || this.segments.length === 0) return false;

		// Return early if n is 0
		if (n === 0) return true;

		this.spinning = true;

		const TWO_PI = Math.PI * 2;
		const slice = TWO_PI / this.segments.length;

		// Calculate new index (handle wrapping)
		const newIndex = ((this.currentIndex - n) % this.segments.length + this.segments.length) % this.segments.length;

		// Calculate the angle change needed
		// Positive n moves clockwise (segments go "backward" in index)
		// Negative n moves counter-clockwise (segments go "forward" in index)
		const angleChange = n * slice;

		const startAngle = this.currentAngle;
		const targetAngle = this.currentAngle + angleChange;
		const deltaAngle = targetAngle - startAngle;

		const startTime = performance.now();

		// Use a smooth easing function (ease-out)
		const easing = (t) => 1 - Math.pow(1 - t, 3);

		const animate = (currentTime) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(1, elapsed / duration);
			const easedProgress = easing(progress);

			// Update current angle
			this.currentAngle = startAngle + (deltaAngle * easedProgress);
			this.drawWheel();

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				// Ensure we end at exactly the target angle
				this.currentAngle = targetAngle;
				this.currentIndex = newIndex;
				this.drawWheel();
				this.spinning = false;

				// Call the spin complete callback if it exists
				if (this.onSpinComplete) {
					this.onSpinComplete(this.currentIndex, this.segments[this.currentIndex]);
				}
			}
		};

		requestAnimationFrame(animate);
		return true;
	}

}

class RemovedSegmentsManager {
	constructor() {
		this.removedSegments = [];
		this.maxRemoved = 25; // Keep last N removed segments
	}

	addRemovedSegment(segment) {
		// Add to beginning of array
		this.removedSegments.unshift({
			...segment,
			removedAt: Date.now()
		});

		// Keep only the most recent ones
		if (this.removedSegments.length > this.maxRemoved) {
			this.removedSegments = this.removedSegments.slice(0, this.maxRemoved);
		}

		this.renderRemovedSegments();
	}

	reAddSegment(index) {
		if (index >= 0 && index < this.removedSegments.length) {
			const segment = this.removedSegments.splice(index, 1)[0];
			this.renderRemovedSegments();
			return segment;
		}
		return null;
	}

	renderRemovedSegments() {
		const container = document.getElementById('removedItems');
		const section = document.getElementById('recentlyRemovedSection');

		if (!container || !section) return;

		if (this.removedSegments.length === 0) {
			section.style.display = 'none';
			return;
		}

		section.style.display = 'block';
		container.innerHTML = '';

		this.removedSegments.forEach((segment, index) => {
			const item = document.createElement('div');
			item.className = 'removed-item';

			const name = document.createElement('span');
			name.className = 'removed-item-name';
			name.textContent = segment.displayName || 'Unnamed';

			const reAddBtn = document.createElement('button');
			reAddBtn.className = 'readd-btn';
			reAddBtn.textContent = 'Re-add';
			reAddBtn.onclick = () => {
				const removedSegment = this.reAddSegment(index);
				if (removedSegment && window.rouletteApp) {
					window.rouletteApp.reAddSegment(removedSegment);
				}
			};

			item.appendChild(name);
			item.appendChild(reAddBtn);
			container.appendChild(item);
		});
	}
}

// =======================
// ROULETTE APP CLASS
// =======================
class RouletteApp {
	constructor() {
		// Initialize components
		this.wheel = new RouletteWheel('wheelCanvas', {
			onSpinComplete: (index, segment) => this.onSpinComplete(index, segment),
			onSegmentsUpdated: (segments, hasSegments) => this.onSegmentsUpdated(segments, hasSegments)
		});

		this.connectionManager = new ConnectionManager({
			onConnect: (info) => this.updateConnectionStatus(true, info),
			onDisconnect: (reason) => this.updateConnectionStatus(false, reason),
			onError: (error) => this.updateConnectionStatus(false, error)
		});


		this.removedSegmentsManager = new RemovedSegmentsManager();

		// Get DOM elements
		this.elements = {
			connDot: document.getElementById('connDot'),
			connText: document.getElementById('connText'),
			segCount: document.getElementById('segCount'),
			currName: document.getElementById('currentName'),
			spinBtn: document.getElementById('spinBtn'),
			execBtn: document.getElementById('executeBtn'),
			stopBtn: document.getElementById('stopBtn'),
			removeBtn: document.getElementById('removeBtn'),
			nextBtn: document.getElementById('nextBtn'),
			prevBtn: document.getElementById('prevBtn'),
			noSeg: document.getElementById('noSeg'),
			configTextarea: document.getElementById('configTextarea'),
			loadConfigBtn: document.getElementById('loadConfigBtn'),
			configStatus: document.getElementById('configStatus'),
			newSegmentInput: document.getElementById('newSegmentInput'),
			addSegmentBtn: document.getElementById('addSegmentBtn'),
		};

		this.initialize();
	}

	initialize() {
		// Load default config into textarea on first run
		this.loadDefaultConfigToTextarea();

		// Load segments from textarea
		this.loadSegmentsFromTextarea();

		// Connect to GLaMS
		this.connectToGLaMS().catch(() => { });

		// Set up event listeners
		this.elements.spinBtn?.addEventListener('click', () => this.spin());
		this.elements.execBtn?.addEventListener('click', () => this.executeCurrent());
		this.elements.stopBtn?.addEventListener('click', () => this.stopAll());
		this.elements.removeBtn?.addEventListener('click', () => this.removeCurrent());
		this.elements.nextBtn?.addEventListener('click', () => this.moveWheelNPlaces(1));
		this.elements.prevBtn?.addEventListener('click', () => this.moveWheelNPlaces(-1));
		this.elements.loadConfigBtn?.addEventListener('click', () => this.loadSegmentsFromTextarea());
		this.elements.addSegmentBtn?.addEventListener('click', () => this.addNewSegment());
		this.elements.newSegmentInput?.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') this.addNewSegment();
		});
	}

	loadDefaultConfigToTextarea() {
		// First try to load from localStorage
		if (this.loadConfigFromStorage()) {
			return;
		}

		// Fall back to default config if nothing in storage
		try {
			const configElement = document.getElementById('default-segments-config');
			if (!configElement || !this.elements.configTextarea) return;

			const config = JSON.parse(configElement.textContent || '{}');
			this.elements.configTextarea.value = JSON.stringify(config, null, 2);
		} catch (e) {
			console.error('Failed to load default config', e);
		}
	}

	saveConfigToStorage() {
		if (!this.elements.configTextarea) return;

		try {
			localStorage.setItem('roulette-config', this.elements.configTextarea.value);
		} catch (e) {
			console.warn('Failed to save config to localStorage:', e);
		}
	}

	loadConfigFromStorage() {
		try {
			const saved = localStorage.getItem('roulette-config');
			if (saved && this.elements.configTextarea) {
				this.elements.configTextarea.value = saved;
				return true;
			}
		} catch (e) {
			console.warn('Failed to load config from localStorage:', e);
		}
		return false;
	}

	addSegment(displayName) {
		if (!displayName || typeof displayName !== 'string') {
			console.warn('Invalid segment name');
			return false;
		}

		try {
			// Parse current config from textarea
			const configText = this.elements.configTextarea?.value.trim() || '{"segments":[]}';
			const config = JSON.parse(configText);

			// Ensure segments array exists
			if (!config.segments) {
				config.segments = [];
			}

			// Create new segment
			const newSegment = {
				displayName: displayName.trim(),
				actions: []
			};

			// Add to config
			config.segments.push(newSegment);

			// Update textarea with new config
			this.elements.configTextarea.value = JSON.stringify(config, null, 2);

			// Reload segments from updated textarea
			this.loadSegmentsFromTextarea();

			return true;
		} catch (e) {
			console.error('Failed to add segment:', e);
			return false;
		}
	}

	loadSegmentsFromTextarea() {
		try {
			if (!this.elements.configTextarea) return false;

			const configText = this.elements.configTextarea.value.trim();
			if (!configText) {
				this.updateConfigStatus('No configuration provided', 'error');
				this.wheel.loadSegments([]);
				return false;
			}

			const config = JSON.parse(configText);
			const success = this.wheel.loadSegments(config.segments || []);

			this.updateConfigStatus(
				success ? `Loaded ${config.segments?.length || 0} segments` : 'No segments found in config',
				success ? 'success' : 'error'
			);

			// Save to localStorage on successful load
			if (success) {
				this.saveConfigToStorage();
			}

			return success;
		} catch (e) {
			this.updateConfigStatus(`Invalid JSON: ${e.message}`, 'error');
			this.wheel.loadSegments([]);
			return false;
		}
	}

	updateConfigStatus(message, type = '') {
		if (!this.elements.configStatus) return;

		this.elements.configStatus.textContent = message;
		this.elements.configStatus.className = `config-status ${type}`;

		// Clear status after 3 seconds for non-error messages
		if (type !== 'error') {
			setTimeout(() => {
				if (this.elements.configStatus) {
					this.elements.configStatus.textContent = 'Ready';
					this.elements.configStatus.className = 'config-status';
				}
			}, 3000);
		}
	}

	onSpinComplete(index, segment) {
		if (this.elements.currName) {
			this.elements.currName.textContent = segment?.displayName ?? '—';
		}

		// Re-enable buttons
		if (this.elements.spinBtn) this.elements.spinBtn.disabled = false;
		if (this.elements.execBtn) this.elements.execBtn.disabled = false;
		if (this.elements.stopBtn) this.elements.stopBtn.disabled = false;
		if (this.elements.removeBtn) this.elements.removeBtn.disabled = false;
	}

	onSegmentsUpdated(segments, hasSegments) {
		// Update segment count
		if (this.elements.segCount) {
			this.elements.segCount.textContent = `${segments.length} segments loaded`;
		}

		// Update button states
		if (this.elements.spinBtn) this.elements.spinBtn.disabled = !hasSegments;
		if (this.elements.execBtn) this.elements.execBtn.disabled = !hasSegments;
		if (this.elements.removeBtn) this.elements.removeBtn.disabled = !hasSegments;

		// Show/hide no segments message
		if (this.elements.noSeg) {
			this.elements.noSeg.style.display = hasSegments ? 'none' : 'block';
		}

		// Update current name
		if (this.elements.currName) {
			const current = this.wheel.getCurrentSegment();
			this.elements.currName.textContent = current?.displayName ?? 'None';
		}
	}

	updateConnectionStatus(connected, info = '') {
		if (this.elements.connDot) {
			this.elements.connDot.classList.toggle('connected', connected);
		}

		if (this.elements.connText) {
			this.elements.connText.textContent = connected ?
				`Connected to ${this.connectionManager.currentRoom || ROOM_NAME}` :
				'Disconnected';
		}
	}

	spin() {
		if (!this.wheel.spin()) return;

		// Disable buttons during spin
		if (this.elements.spinBtn) this.elements.spinBtn.disabled = true;
		if (this.elements.execBtn) this.elements.execBtn.disabled = true;
		if (this.elements.removeBtn) this.elements.removeBtn.disabled = true;
	}

	moveWheelNPlaces(n, duration = 500) {
		return this.wheel.moveNPlaces(n, duration);
	}

	withTimeout(promise, timeoutMs = 10000) {
		return Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('timeout')), timeoutMs)
			)
		]);
	}

	async executeCurrent() {
		if (!this.connectionManager.isConnected) return;

		const segment = this.wheel.getCurrentSegment();
		if (!segment) return;

		const execBtn = this.elements.execBtn;
		if (!execBtn) return;

		execBtn.disabled = true;
		const oldText = execBtn.textContent;
		execBtn.textContent = 'Executing…';

		try {
			const actions = segment.actions || [];
			for (const action of actions) {
				await this.connectionManager.executeAction(
					action.manipulatorId,
					action.actionName,
					action.parameters || {}
				);
				await new Promise(r => setTimeout(r, 100));
			}
		} catch (e) {
			console.warn('Execute failed:', e.message);
		}
		finally {
			execBtn.textContent = oldText;
			execBtn.disabled = false;
		}
	}

	async stopAll() {
		if (!this.connectionManager.isConnected) return;

		const stopBtn = this.elements.stopBtn;
		if (!stopBtn) return;

		stopBtn.disabled = true;
		const oldText = stopBtn.textContent;
		stopBtn.textContent = 'Stopping…';

		try {
			await this.connectionManager.disableAllManipulators().catch(e => console.warn('Disable failed:', e.message));
			await new Promise(r => setTimeout(r, 100));
			await this.connectionManager.resetManipulatorConfigs().catch(e => console.warn('Reset failed:', e.message));
		} catch (e) {
			// Just log it and move on
			console.warn('Stop timed out or failed:', e.message);
		} finally {
			stopBtn.textContent = oldText;
			stopBtn.disabled = false;
		}
	}

	removeCurrent() {
		const currentSegment = this.wheel.getCurrentSegment();
		if (currentSegment) {
			// Add to removed segments before removing from wheel
			this.removedSegmentsManager.addRemovedSegment(currentSegment);
		}
		this.wheel.removeCurrentSegment();
	}

	reAddSegment(segment) {
		// Insert the segment at a random position
		const randomIndex = Math.floor(Math.random() * (this.wheel.segments.length + 1));
		this.wheel.segments.splice(randomIndex, 0, segment);

		// If the wheel currently has a selected segment, we need to update the currentIndex
		// if the insertion point affects it
		if (this.wheel.currentIndex >= 0 && randomIndex <= this.wheel.currentIndex) {
			this.wheel.currentIndex++;
		}

		// Invalidate the wheel's cache since segments changed
		this.wheel.wheelImageCache = null;
		this.wheel.lastSegmentsHash = null;

		// Update the wheel display and UI
		this.wheel.onSegmentsUpdated(this.wheel.segments, this.wheel.segments.length > 0);
		this.wheel.drawWheel();
	}

	async connectToGLaMS() {
		try {
			await this.connectionManager.connect(ROOM_NAME, 'browser');
		} catch (e) {
			console.error('Connection failed', e);
		}
	}

	addNewSegment() {
		if (!this.elements.newSegmentInput) return;

		const segmentName = this.elements.newSegmentInput.value.trim();
		if (!segmentName) {
			this.updateConfigStatus('Please enter a segment name', 'error');
			return;
		}

		if (this.addSegment(segmentName)) {
			this.elements.newSegmentInput.value = ''; // Clear input on success
			this.updateConfigStatus(`Added segment: ${segmentName}`, 'success');
		} else {
			this.updateConfigStatus('Failed to add segment', 'error');
		}
	}

}

// =======================
// INITIALIZATION
// =======================

// Initialize when DOM is loaded
function initializeRouletteApp() {
	const rouletteApp = new RouletteApp();
	window.rouletteApp = rouletteApp; // For debugging
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeRouletteApp);
} else {
	initializeRouletteApp();
}