"use strict";

onmessage = function evaluateMatches(event) {
    function word(index, display = true) {
        if (display) return words[index];
        if (!latinChars) return words[index].toLowerCase();
        return simpleWords[index];
    }
    const [words, simpleWords, customStart, dictStart, guessableIndices, latinChars, results] = event.data;
    const guessableWords = guessableIndices.map(index => word(index, false));

    let lastIndex = 0;
    const possibleInGuessable = results.map((index, i) => lastIndex = guessableIndices.indexOf(index, lastIndex));
    const possibleWords = results.map(index => word(index, false));
    const invWordBits = possibleWords.map(w => ~(new Set(w).keys().reduce((bits, l) => bits + alphabetBit(l), 0)));
    const weights = results.map(index => Math.max(0.01, 1 / (1 + Math.exp((index - 37_000) / 3000))));
    const possibleWordsWeight = weights.reduce((sum, w) => sum + w);
    const guessLen = guessableWords.length;

    let expectedInfo = new Array(guessLen).fill(0);
    let guessMatches = new Array(guessLen);
    let bestEI = 0;
    let bestGuessIndex = -1;
    for (let i = 0; i < guessLen; i++) {
        const guessWord = guessableWords[i];

        const [patternWeights, matchIndices] = wordleMatches(possibleWords, guessWord, invWordBits, weights);
        guessMatches[i] = matchIndices.map(pattern => pattern.map(index => results[index]));

        for (let patternWeight of patternWeights) {
            if (patternWeight === 0) continue;

            const patternBits = Math.log2(possibleWordsWeight / patternWeight);
            expectedInfo[i] += patternWeight * patternBits;
        }
        expectedInfo[i] /= possibleWordsWeight;

        if (expectedInfo[i] > bestEI) {
            bestGuessIndex = i;
            bestEI = expectedInfo[i];
        }

        postMessage(i);
    }

    const remainingEntropy = weights.reduce((sum, w) => sum + w * Math.log2(possibleWordsWeight / w), 0) / possibleWordsWeight;

    let bestScore = entropyGuesses(remainingEntropy - bestEI);
    let expectedScore = expectedInfo.map((info, index) => [index, entropyGuesses(remainingEntropy - info), true]);

    for (let i = 0; i < results.length; i++) {
        const guessIndex = possibleInGuessable[i];

        const score = (1 - weights[i] / possibleWordsWeight) * entropyGuesses(remainingEntropy - expectedInfo[guessIndex]);
        expectedScore[guessIndex][1] = score;
        expectedScore[guessIndex][2] = false;
        if (score < bestScore) {
            bestGuessIndex = guessIndex;
            bestScore = score;
        }
    }

    expectedScore.sort((a, b) => a[1] - b[1]);

    let outputHTML = "";

    let counter = 0;
    for (let i = 0; counter < 100 && i < expectedScore.length; i++) {
        const info = " +" + round(expectedScore[i][1]) + " guess" + (expectedScore[i][1] === 1 ? "" : "es");

        if (expectedScore[i][2]) {
            if (i < 10) outputHTML += "<p>" + word(guessableIndices[expectedScore[i][0]]) + info + "</p>";
            continue;
        }
        const index = guessableIndices[expectedScore[i][0]];
        let placeLabel = index + 1;
        if (index >= dictStart) placeLabel = "csw2021";
        else if (index >= customStart) placeLabel = "custom added";
        placeLabel = " [" + placeLabel + "]";

        outputHTML += "<p>" + ++counter + ". " + word(index) + placeLabel + info + "</p>";
    }

    const guessBitsInfo = " remaining (" + round(expectedInfo[bestGuessIndex]) + " / " + round(bestEI) + " bit" + (bestEI === 1 ? ") " : "s) ");
    const bestGuessMsg = "Best guess: " + guessableWords[bestGuessIndex] + " with " + round(bestScore) + guessBitsInfo;

    postMessage([bestGuessMsg, outputHTML]);
}

function wordleMatches(possibleWords, guessWord, txtBits, weights) {
    const wordLen = guessWord.length;
    const zeroArray = new Array(wordLen).fill(0);
    const guessWordBits = [...guessWord].map(l => alphabetBit(l));
    let guessWordPrior = [0];
    for (let i = 1; i < wordLen; i++) {
        let done = 0;
        for (let j = 0; j < i; j++) done += guessWord[j] === guessWord[i];
        guessWordPrior[i] = done;
    }

    let patternWeight = new Array(Math.pow(4, wordLen) - 2).fill(0);
    let patternWordIndices = patternWeight.slice().map(_ => []);
    const pWL = possibleWords.length;
    for (let i = 0; i < pWL; i++) {
        const txt = possibleWords[i];
        let patternIndex = 0;

        for (let j = 0; j < wordLen; j++) {
            if (guessWordBits[j] & txtBits[i]) continue;
            if (guessWord[j] === txt[j]) {
                patternIndex += 2 << j * 2;
                continue;
            }

            let freeLetters = 0;
            for (let k = 0; k < wordLen; k++) {
                freeLetters += txt[k] === guessWord[j] && txt[k] !== guessWord[k];
            }

            if (guessWordPrior[j] < freeLetters) patternIndex += 1 << j * 2;
        }
        patternWeight[patternIndex] += weights[i];
        patternWordIndices[patternIndex].push(i);
    }
    return [patternWeight, patternWordIndices];
}

function alphabetBit(l) {
    return 1 << l.charCodeAt() - 'a'.charCodeAt();
}

function entropyGuesses(entropy) {
    return Math.log10(entropy / 4 + 1) * 4 + 1;
}

function round(x, n = 1000) {
    return Math.round(x * n) / n;
}