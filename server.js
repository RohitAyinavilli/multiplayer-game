// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/tictactoe', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tictactoe.html'));
});

app.get('/hangman', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'hangman.html'));
});

let tictactoeState = {
    board: Array(9).fill(''),
    currentPlayer: 'X',
    players: [],
};

let hangmanState = {
    players: [],
    words: {},
    guessedLetters: {},
    incorrectGuesses: {},
    maxIncorrectGuesses: 6
};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join tictactoe', () => {
        if (tictactoeState.players.length < 2) {
            tictactoeState.players.push(socket.id);
            if (tictactoeState.players.length === 1) {
                io.to(socket.id).emit('waiting for opponent');
            } else {
                io.emit('game started');
            }
        } else {
            socket.emit('game full');
            socket.disconnect();
        }
    });

    socket.on('make move', (index) => {
        if (tictactoeState.board[index] === '' && tictactoeState.players.includes(socket.id)) {
            tictactoeState.board[index] = tictactoeState.currentPlayer;
            io.emit('update board', tictactoeState.board);

            if (checkWinner(tictactoeState.board)) {
                io.emit('game over', `${tictactoeState.currentPlayer} wins!`);
                resetTicTacToe();
            } else if (!tictactoeState.board.includes('')) {
                io.emit('game over', 'It\'s a draw!');
                resetTicTacToe();
            } else {
                tictactoeState.currentPlayer = tictactoeState.currentPlayer === 'X' ? 'O' : 'X';
            }
        }
    });

    socket.on('join hangman', () => {
        if (hangmanState.players.length < 2) {
            hangmanState.players.push(socket.id);
            hangmanState.guessedLetters[socket.id] = [];
            hangmanState.incorrectGuesses[socket.id] = 0;
            socket.emit('submit word');
        } else {
            socket.emit('game full');
            socket.disconnect();
        }
    });

    socket.on('submit word', (word) => {
        hangmanState.words[socket.id] = word.toLowerCase();
        if (Object.keys(hangmanState.words).length === 2) {
            io.emit('start guessing');
        }
    });

    socket.on('make guess', (letter) => {
        const opponentId = hangmanState.players.find(id => id !== socket.id);
        if (opponentId && !hangmanState.guessedLetters[socket.id].includes(letter)) {
            hangmanState.guessedLetters[socket.id].push(letter);
            if (!hangmanState.words[opponentId].includes(letter)) {
                hangmanState.incorrectGuesses[socket.id]++;
            }

            io.to(socket.id).emit('update word', getWordDisplay(hangmanState.words[opponentId], hangmanState.guessedLetters[socket.id]));
            io.to(socket.id).emit('update guesses', hangmanState.guessedLetters[socket.id]);

            if (hangmanState.incorrectGuesses[socket.id] >= hangmanState.maxIncorrectGuesses) {
                io.to(socket.id).emit('game over', 'You lost! The word was ' + hangmanState.words[opponentId]);
                io.to(opponentId).emit('game over', 'You won!');
                resetHangman();
            } else if (isWordGuessed(hangmanState.words[opponentId], hangmanState.guessedLetters[socket.id])) {
                io.to(socket.id).emit('game over', 'You won!');
                io.to(opponentId).emit('game over', 'You lost!');
                resetHangman();
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        tictactoeState.players = tictactoeState.players.filter(id => id !== socket.id);
        hangmanState.players = hangmanState.players.filter(id => id !== socket.id);
        delete hangmanState.words[socket.id];
        delete hangmanState.guessedLetters[socket.id];
        delete hangmanState.incorrectGuesses[socket.id];
        if (tictactoeState.players.length === 0) resetTicTacToe();
        if (hangmanState.players.length === 0) resetHangman();
    });
});

function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    return winPatterns.some(pattern => {
        const [a, b, c] = pattern;
        return board[a] && board[a] === board[b] && board[a] === board[c];
    });
}

function resetTicTacToe() {
    tictactoeState.board = Array(9).fill('');
    tictactoeState.currentPlayer = 'X';
    io.emit('reset game');
}

function resetHangman() {
    hangmanState.players = [];
    hangmanState.words = {};
    hangmanState.guessedLetters = {};
    hangmanState.incorrectGuesses = {};
    io.emit('reset game');
}

function getWordDisplay(word, guessedLetters) {
    return word.split('').map(letter => guessedLetters.includes(letter) ? letter : '_');
}

function isWordGuessed(word, guessedLetters) {
    return word.split('').every(letter => guessedLetters.includes(letter));
}

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});