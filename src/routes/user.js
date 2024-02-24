import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../dbConnect.js';
import format from 'pg-format';
import { lockedAccountFor, maxLoginAttempts } from '../utils/constants.js';
const router = express.Router();

const logIn = async (req, res) => {
	const { email, password } = req.body;

	try {
		let oldUsers;
		await pool
			.query(format(`SELECT * FROM users WHERE email=%L;`, email))
			.then((data) => {
				oldUsers = data.rows;
			});

		const oldUser = oldUsers.length !== 0 ? oldUsers[0] : null;

		if (!oldUser)
			return res.status(404).json({ message: "User doesn't exist" });

		const isPasswordCorrect = await bcrypt.compare(password, oldUser.password);

		if (!isPasswordCorrect) {
			// not sure why type was a string and not a number, but this fixes the issue
			const max_failed_login_attempts_at = parseInt(
				oldUser.max_failed_login_attempts_at
			);
			if (
				max_failed_login_attempts_at &&
				max_failed_login_attempts_at + lockedAccountFor > new Date().getTime()
			) {
				return res.status(400).json({
					message: `Account locked until: ${new Date(
						max_failed_login_attempts_at + lockedAccountFor
					).toGMTString()}`,
				});
			}

			// increment failed_login_attempts
			// if the increment of failed_login_attempts % maxLoginAttempts = 0, set max_failed_login_attempts_at to current time
			await pool.query(
				`UPDATE users SET failed_login_attempts = failed_login_attempts + 1, max_failed_login_attempts_at = (CASE WHEN (MOD(failed_login_attempts + 1 , ${maxLoginAttempts}) = 0) THEN ${new Date().getTime()} ELSE NULL END) WHERE id = ${
					oldUser.id
				};`
			);
			return res.status(400).json({ message: 'Invalid credentials' });
		}

		const token = jwt.sign(
			{
				email: oldUser.email,
				id: oldUser.id,
				account_type: oldUser.account_type,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '1h' }
		);

		res.status(200).json({ token, user: { email } });
	} catch (err) {
		console.log(err);
		res.status(500).json({ message: 'Something went wrong' });
	}
};

const signUp = async (req, res) => {
	const { email, password } = req.body;

	try {
		let oldUsers;
		await pool
			.query(format(`SELECT * FROM users WHERE email=%L;`, email))
			.then((data) => {
				oldUsers = data.rows;
			});

		const oldUser = oldUsers.length !== 0 ? oldUsers[0] : null;

		if (oldUser)
			return res.status(400).json({ message: 'Email already in use' });

		const hashedPassword = await bcrypt.hash(password, 12);

		let result;
		await pool
			.query(
				format(
					`INSERT INTO users (email, password) VALUES (%L, %L) RETURNING id, account_type;`,
					email,
					hashedPassword
				)
			)
			.then((data) => {
				result = data.rows[0];
			});

		const token = jwt.sign(
			{ email, account_type: result.account_type, id: result.id },
			process.env.JWT_SECRET,
			{
				expiresIn: '1h',
			}
		);

		res.status(201).json({ token, user: { email } });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: 'Something went wrong' });
	}
};

router.post('/logIn', logIn);
router.post('/signUp', signUp);

export default router;
