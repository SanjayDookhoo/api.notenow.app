// import 'dotenv/config';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import userRouter from './routes/user.js';
import generalRouter from './routes/general.js';
import auth from './middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import filesRouter from './routes/files.js';
import profileRouter from './routes/profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
global.__basedir = __dirname;

const { SERVER_PORT, NODE_ENV } = process.env;

const app = express();
app.use(express.json());

app.use(cors());

app.get('/', (req, res) => {
	res.json({
		message: 'Hello World',
	});
});

app.use('/user', userRouter);
app.use('', auth, generalRouter);
app.use('/files', filesRouter);
app.use('/profile', profileRouter);

app.listen(SERVER_PORT, () =>
	console.log(`Server Running on Port: http://localhost:${SERVER_PORT}`)
);
