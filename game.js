document.addEventListener('DOMContentLoaded', () => {
    const game = new TapTitanica();
    document.getElementById('start-button').addEventListener('click', () => {
        game.startGame();
    });
});

class TapTitanica {
    constructor() {
        // Références DOM
        this.dom = {
            lane: document.getElementById('rhythm-lane'),
            actionZone: document.getElementById('action-zone'),
            feedback: document.getElementById('feedback-display'),
            score: document.getElementById('score'),
            combo: document.getElementById('combo-display'),
            difficulty: document.getElementById('difficulty'),
            accuracy: document.getElementById('accuracy'),
            titanHPBar: document.getElementById('titan-hp-bar'),
            titanSprite: document.getElementById('titan-sprite'),
            gameOverlay: document.getElementById('game-overlay'),
            overlayContent: document.getElementById('overlay-content'),
        };

        // Constantes de Jeu
        this.CONFIG = {
            NOTE_TRAVEL_TIME: 1500, // Temps (ms) pour traverser l'écran (Approach Rate)
            TIMING: {
                PERFECT: 50,  // ±50ms
                GOOD: 120,    // ±120ms
            },
            BASE_DAMAGE: 50,
            MAX_DIFFICULTY: 10,
            PERFORMANCE_HISTORY_LENGTH: 20,
            TITAN_MAX_HP: 10000,
        };

        // État du Jeu
        this.gameState = 'loading';
        this.activeNotes = [];
        this.gameStartTime = 0;

        // Statistiques Joueur
        this.score = 0;
        this.combo = 0;
        // RPG Léger : Bonus d'équipement (multiplicateur de dégâts)
        this.equipmentBonus = 1.1;

        // Titan
        this.titanHP = this.CONFIG.TITAN_MAX_HP;

        // IA Adaptative (Chorégraphe de Combat)
        this.ai = {
            difficultyLevel: 1,
            // Historique (Poids: Parfait=1.0 (100%), Bien=0.7 (70%), Raté=0.0 (0%))
            performanceHistory: [],
            nextSequenceTime: 0, // Quand démarrer la prochaine séquence
        };

        this.bindEvents();
    }

    bindEvents() {
        // Gestion des inputs (Souris et Tactile)
        this.dom.actionZone.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.handleInput();
        });
        this.dom.actionZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleInput();
        });
    }

    // =====================================================
    // CONTRÔLE DU JEU
    // =====================================================

    startGame() {
        this.resetGame();
        this.gameState = 'playing';
        this.dom.gameOverlay.classList.remove('active');
        // Utilisation de performance.now() pour un timing précis
        this.gameStartTime = performance.now();
        // Démarrer la première séquence après un court délai
        this.ai.nextSequenceTime = this.CONFIG.NOTE_TRAVEL_TIME + 1000;
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    resetGame() {
        this.score = 0;
        this.combo = 0;
        this.titanHP = this.CONFIG.TITAN_MAX_HP;
        this.ai.difficultyLevel = 1;
        this.ai.performanceHistory = [];
        this.activeNotes = [];

        // Nettoyer les notes restantes
        while (this.dom.lane.firstChild && this.dom.lane.firstChild.id !== 'target-marker') {
            this.dom.lane.removeChild(this.dom.lane.firstChild);
        }
        this.updateUI();
    }

    endGame() {
        this.gameState = 'ended';
        this.dom.overlayContent.innerHTML = `
            <h1>Victoire !</h1>
            <p>Le Titan est vaincu !</p>
            <p>Score Final: ${this.score}</p>
            <button id="restart-button">Recommencer</button>
        `;
        this.dom.gameOverlay.classList.add('active');

        document.getElementById('restart-button').addEventListener('click', () => {
            this.startGame();
        });
    }

    // =====================================================
    // BOUCLE DE JEU PRINCIPALE
    // =====================================================

    gameLoop(currentTime) {
        if (this.gameState !== 'playing') return;

        const gameTime = currentTime - this.gameStartTime;

        this.update(gameTime);
        this.draw(gameTime);

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(gameTime) {
        // 1. Gestion des séquences IA
        // On génère la séquence lorsque le temps de jeu atteint le moment prévu
        if (gameTime >= this.ai.nextSequenceTime - this.CONFIG.NOTE_TRAVEL_TIME) {
            this.generateAttackSequence();
        }

        // 2. Vérification des notes manquées
        for (let i = this.activeNotes.length - 1; i >= 0; i--) {
            const note = this.activeNotes[i];

            // Si la note dépasse la fenêtre 'Bien', c'est un raté
            if (gameTime > note.targetTime + this.CONFIG.TIMING.GOOD) {
                this.registerHit('MISS', note);
                this.removeNote(i);
            }
        }
    }

    draw(gameTime) {
        // Mise à jour visuelle de la position des notes
        this.activeNotes.forEach(note => {
            // Calcul de la progression (0 = spawn, 1 = cible)
            const progress = (gameTime - note.spawnTime) / this.CONFIG.NOTE_TRAVEL_TIME;

            if (progress >= 0 && progress <= 1.1) { // 1.1 pour laisser la note sortir un peu
                const laneHeight = this.dom.lane.clientHeight;
                // Utilisation de transform pour des performances optimales
                const currentY = progress * laneHeight;
                note.element.style.transform = `translateY(${currentY}px)`;
            }
        });
    }

    // =====================================================
    // IA CHORÉGRAPHE DE COMBAT (Adaptative)
    // =====================================================

    // Génération procédurale basée sur la difficulté
    generateAttackSequence() {
        const difficulty = this.ai.difficultyLevel;
        let sequence = [];

        // Détermination du BPM (Vitesse). Niveau 1 = 100 BPM, Niveau 10 = 190 BPM.
        const bpm = 100 + (difficulty - 1) * 10;
        const beatInterval = 60000 / bpm; // Temps en ms entre deux battements (noires)

        // Durée de la séquence (ex: 8 battements)
        const sequenceLength = 8;
        let currentTime = this.ai.nextSequenceTime;

        for (let i = 0; i < sequenceLength; i++) {
            // Densité : Probabilité d'avoir une note sur le temps
            const density = 0.5 + (difficulty * 0.04); // 54% à Niv 1, 90% à Niv 10

            if (Math.random() < density) {
                this.spawnNote(currentTime);
            }

            // Complexité : Introduction de syncopes (contretemps / croches)
            if (difficulty >= 4) {
                // Chance d'ajouter une note sur le demi-temps
                const syncopeChance = (difficulty - 3) * 0.1; // 10% à Niv 4, 70% à Niv 10
                if (Math.random() < syncopeChance) {
                    this.spawnNote(currentTime + beatInterval / 2);
                }
            }

             // Complexité avancée : Doubles croches rapides (Niv 8+)
             if (difficulty >= 8 && Math.random() < 0.3) {
                this.spawnNote(currentTime + beatInterval / 4);
             }

            currentTime += beatInterval;
        }

        // Planifier la prochaine séquence après celle-ci, avec une pause d'une mesure (4 temps)
        this.ai.nextSequenceTime = currentTime + beatInterval * 4;
    }

    // Suivi de la performance et ajustement de la difficulté
    adjustDifficulty() {
        const historyLength = this.ai.performanceHistory.length;
        if (historyLength === 0) {
            this.dom.accuracy.textContent = "Précision: N/A";
            return;
        }

        // Calcul de la précision moyenne
        const averageAccuracy = this.ai.performanceHistory.reduce((a, b) => a + b, 0) / historyLength;
        this.dom.accuracy.textContent = `Précision: ${(averageAccuracy * 100).toFixed(0)}%`;

        // Ajustement seulement si on a assez de données
        if (historyLength < this.CONFIG.PERFORMANCE_HISTORY_LENGTH) {
            return;
        }

        let adjusted = false;
        // Si > 90%, augmenter la difficulté
        if (averageAccuracy > 0.90) {
            if (this.ai.difficultyLevel < this.CONFIG.MAX_DIFFICULTY) {
                this.ai.difficultyLevel++;
                adjusted = true;
            }
        }
        // Si < 60%, diminuer la difficulté
        else if (averageAccuracy < 0.60) {
            if (this.ai.difficultyLevel > 1) {
                this.ai.difficultyLevel--;
                adjusted = true;
            }
        }
        // Entre 60% et 90%, état de "flow", on ne change rien.

        if (adjusted) {
            console.log(`Difficulté ajustée à ${this.ai.difficultyLevel}`);
            // Réinitialiser l'historique pour réévaluer le nouveau niveau
            this.ai.performanceHistory = [];
        }
    }

    recordPerformance(weight) {
        this.ai.performanceHistory.push(weight);
        if (this.ai.performanceHistory.length > this.CONFIG.PERFORMANCE_HISTORY_LENGTH) {
            this.ai.performanceHistory.shift(); // Garder seulement les N derniers
        }
        this.adjustDifficulty();
    }

    // =====================================================
    // GESTION DES INPUTS ET LOGIQUE DE JEU
    // =====================================================

    handleInput() {
        if (this.gameState !== 'playing') return;

        const currentTime = performance.now() - this.gameStartTime;
        let hitRegistered = false;

        // Vérifier les notes actives
        for (let i = 0; i < this.activeNotes.length; i++) {
            const note = this.activeNotes[i];
            const timeDifference = Math.abs(currentTime - note.targetTime);

            if (timeDifference <= this.CONFIG.TIMING.PERFECT) {
                this.registerHit('PERFECT', note);
                this.removeNote(i);
                hitRegistered = true;
                break; // Une seule note par input
            } else if (timeDifference <= this.CONFIG.TIMING.GOOD) {
                this.registerHit('GOOD', note);
                this.removeNote(i);
                hitRegistered = true;
                break;
            }
        }

        // Si on tape dans le vide, cela brise le combo (optionnel, peut être frustrant)
        /*
        if (!hitRegistered) {
           this.registerHit('MISS', null);
        }
        */
    }

    registerHit(quality, note) {
        let damage = 0;
        let performanceWeight = 0;
        let feedbackColor = "#ffffff";

        switch (quality) {
            case 'PERFECT':
                // 150% de dégâts
                damage = this.CONFIG.BASE_DAMAGE * 1.5 * this.equipmentBonus;
                this.combo++;
                performanceWeight = 1.0; // 100%
                feedbackColor = "#f1c40f"; // Jaune
                break;
            case 'GOOD':
                // 100% de dégâts
                damage = this.CONFIG.BASE_DAMAGE * 1.0 * this.equipmentBonus;
                this.combo++;
                performanceWeight = 0.7; // 70%
                feedbackColor = "#2ecc71"; // Vert
                break;
            case 'MISS':
                damage = 0;
                this.combo = 0;
                performanceWeight = 0.0; // 0%
                feedbackColor = "#e74c3c"; // Rouge
                // Le joueur pourrait subir des dégâts ici si implémenté
                break;
        }

        if (damage > 0) {
            this.applyDamage(Math.floor(damage));
            this.score += Math.floor(damage * this.combo); // Le score utilise les dégâts et le combo
        }

        this.showFeedback(quality, feedbackColor);
        this.recordPerformance(performanceWeight);
        this.updateUI();
    }

    applyDamage(amount) {
        this.titanHP = Math.max(0, this.titanHP - amount);

        // Effet visuel sur le titan
        this.dom.titanSprite.classList.add('titan-hit');
        setTimeout(() => {
            this.dom.titanSprite.classList.remove('titan-hit');
        }, 150);

        if (this.titanHP <= 0) {
            this.endGame();
        }
    }

    // =====================================================
    // UTILITAIRES ET GESTION DES NOTES
    // =====================================================

    spawnNote(targetTime) {
        const noteElement = document.createElement('div');
        noteElement.classList.add('note');
        // Insérer avant le marqueur cible pour que les notes passent dessous visuellement
        this.dom.lane.insertBefore(noteElement, this.dom.lane.firstChild);

        const note = {
            element: noteElement,
            targetTime: targetTime,
            // Le temps de spawn est calculé en retrait
            spawnTime: targetTime - this.CONFIG.NOTE_TRAVEL_TIME,
        };

        this.activeNotes.push(note);
    }

    removeNote(index) {
        const note = this.activeNotes[index];
        if (note && note.element && note.element.parentNode === this.dom.lane) {
            this.dom.lane.removeChild(note.element);
        }
        this.activeNotes.splice(index, 1);
    }

    updateUI() {
        this.dom.score.textContent = `Score: ${this.score}`;
        this.dom.combo.textContent = `Combo: ${this.combo}`;
        this.dom.difficulty.textContent = `Difficulté: ${this.ai.difficultyLevel}`;

        const hpPercent = (this.titanHP / this.CONFIG.TITAN_MAX_HP) * 100;
        this.dom.titanHPBar.style.width = `${hpPercent}%`;
    }

    showFeedback(message, color) {
        this.dom.feedback.textContent = message;
        this.dom.feedback.style.color = color;
        // Réinitialise l'animation CSS
        this.dom.feedback.classList.remove('animate-feedback');
        // Force le reflow pour redémarrer l'animation
        void this.dom.feedback.offsetWidth;
        this.dom.feedback.classList.add('animate-feedback');
    }
}
