import uploadFile from '../middleware/upload.js';
import express from 'express';
const router = express.Router();

const create = async (req, res) => {
	try {
		await uploadFile(req, res);
	} catch (err) {
		console.log(err);
	}
};

const edit = async (req, res) => {
	try {
		await uploadFile(req, res);
	} catch (err) {
		console.log(err);
	}
};

router.post('/', create);
router.put('/', edit);

export default router;
