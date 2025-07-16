/**
 * Benchmark Helper
 * 
 * High-precision timing utilities for performance measurement
 */

class Benchmark {
    constructor() {
        this.startTimes = new Map();
        this.completedPhases = new Map();
        this.globalStartTime = process.hrtime.bigint();
    }

    /**
     * Start timing a phase
     * @param {string} phaseId - Unique identifier for the phase
     */
    start(phaseId) {
        this.startTimes.set(phaseId, process.hrtime.bigint());
    }

    /**
     * End timing a phase and return duration
     * @param {string} phaseId - Unique identifier for the phase
     * @returns {number} Duration in milliseconds
     */
    end(phaseId) {
        const endTime = process.hrtime.bigint();
        const startTime = this.startTimes.get(phaseId);
        
        if (!startTime) {
            throw new Error(`No start time found for phase: ${phaseId}`);
        }
        
        const durationNs = endTime - startTime;
        const durationMs = Number(durationNs) / 1_000_000; // Convert to milliseconds
        
        this.completedPhases.set(phaseId, {
            duration: durationMs,
            startTime: startTime,
            endTime: endTime
        });
        
        this.startTimes.delete(phaseId);
        
        return Math.round(durationMs * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Get duration of a completed phase
     * @param {string} phaseId - Phase identifier
     * @returns {number|null} Duration in milliseconds or null if not found
     */
    getDuration(phaseId) {
        const phase = this.completedPhases.get(phaseId);
        return phase ? phase.duration : null;
    }

    /**
     * Get total execution time since benchmark creation
     * @returns {number} Total time in milliseconds
     */
    getTotalTime() {
        const currentTime = process.hrtime.bigint();
        const totalNs = currentTime - this.globalStartTime;
        const totalMs = Number(totalNs) / 1_000_000;
        return Math.round(totalMs * 100) / 100;
    }

    /**
     * Get all completed phases with their durations and percentages
     * @returns {Array} Array of phase objects with name, duration, and percentage
     */
    getAllPhases() {
        const totalTime = this.getTotalTime();
        const phases = [];
        
        for (const [phaseId, phaseData] of this.completedPhases.entries()) {
            phases.push({
                name: this.formatPhaseName(phaseId),
                duration: Math.round(phaseData.duration * 100) / 100,
                percentage: (phaseData.duration / totalTime) * 100
            });
        }
        
        // Sort by start time to maintain chronological order
        phases.sort((a, b) => {
            const aPhase = this.completedPhases.get(this.findPhaseId(a.name));
            const bPhase = this.completedPhases.get(this.findPhaseId(b.name));
            return Number(aPhase.startTime - bPhase.startTime);
        });
        
        return phases;
    }

    /**
     * Get summary statistics
     * @returns {Object} Summary with various timing statistics
     */
    getSummary() {
        const phases = this.getAllPhases();
        const totalTime = this.getTotalTime();
        
        if (phases.length === 0) {
            return {
                totalTime,
                phaseCount: 0,
                averagePhaseTime: 0,
                fastestPhase: null,
                slowestPhase: null
            };
        }
        
        const durations = phases.map(p => p.duration);
        const averagePhaseTime = durations.reduce((a, b) => a + b, 0) / durations.length;
        const fastestPhase = phases.find(p => p.duration === Math.min(...durations));
        const slowestPhase = phases.find(p => p.duration === Math.max(...durations));
        
        return {
            totalTime,
            phaseCount: phases.length,
            averagePhaseTime: Math.round(averagePhaseTime * 100) / 100,
            fastestPhase: {
                name: fastestPhase.name,
                duration: fastestPhase.duration
            },
            slowestPhase: {
                name: slowestPhase.name,
                duration: slowestPhase.duration
            }
        };
    }

    /**
     * Reset all timing data
     */
    reset() {
        this.startTimes.clear();
        this.completedPhases.clear();
        this.globalStartTime = process.hrtime.bigint();
    }

    /**
     * Create a sub-benchmark for nested timing
     * @returns {Benchmark} New benchmark instance
     */
    createSubBenchmark() {
        return new Benchmark();
    }

    /**
     * Format phase name for display
     * @param {string} phaseId - Raw phase identifier
     * @returns {string} Formatted name
     */
    formatPhaseName(phaseId) {
        return phaseId
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Find phase ID by formatted name (for sorting)
     * @param {string} formattedName - Formatted phase name
     * @returns {string|null} Original phase ID
     */
    findPhaseId(formattedName) {
        const searchId = formattedName
            .toLowerCase()
            .replace(/\s+/g, '_');
            
        for (const phaseId of this.completedPhases.keys()) {
            if (phaseId === searchId) {
                return phaseId;
            }
        }
        return null;
    }

    /**
     * Generate a detailed timing report
     * @returns {string} Formatted timing report
     */
    generateReport() {
        const summary = this.getSummary();
        const phases = this.getAllPhases();
        
        let report = `\n📊 Performance Report\n`;
        report += `${'='.repeat(50)}\n`;
        report += `Total Execution Time: ${summary.totalTime}ms\n`;
        report += `Number of Phases: ${summary.phaseCount}\n`;
        
        if (phases.length > 0) {
            report += `Average Phase Time: ${summary.averagePhaseTime}ms\n`;
            report += `Fastest Phase: ${summary.fastestPhase.name} (${summary.fastestPhase.duration}ms)\n`;
            report += `Slowest Phase: ${summary.slowestPhase.name} (${summary.slowestPhase.duration}ms)\n\n`;
            
            report += `Phase Breakdown:\n`;
            report += `${'-'.repeat(50)}\n`;
            
            phases.forEach(phase => {
                const percentage = phase.percentage.toFixed(1);
                const bar = '█'.repeat(Math.round(phase.percentage / 5)); // Scale bar to fit
                report += `${phase.name.padEnd(20)} ${phase.duration.toString().padStart(8)}ms (${percentage.padStart(5)}%) ${bar}\n`;
            });
        }
        
        return report;
    }
}

/**
 * Simple timer for one-off measurements
 */
class SimpleTimer {
    constructor() {
        this.startTime = process.hrtime.bigint();
    }

    /**
     * Get elapsed time since timer creation
     * @returns {number} Elapsed time in milliseconds
     */
    elapsed() {
        const currentTime = process.hrtime.bigint();
        const elapsedNs = currentTime - this.startTime;
        const elapsedMs = Number(elapsedNs) / 1_000_000;
        return Math.round(elapsedMs * 100) / 100;
    }

    /**
     * Reset the timer
     */
    reset() {
        this.startTime = process.hrtime.bigint();
    }
}

module.exports = {
    Benchmark,
    SimpleTimer
};