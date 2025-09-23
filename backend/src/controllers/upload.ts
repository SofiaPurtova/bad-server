import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import sharp from 'sharp'
import BadRequestError from '../errors/bad-request-error'
import path from 'path'
import fs from 'fs'
import fileSizeLimits from '../middlewares/file'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }
    // ТЕСТ 13: Проверка минимального размера файла (больше 2KB)
    /*if (req.file.size < 2 * 1024) { // 2KB минимум
        return next(new BadRequestError('Файл слишком маленький'));
    }*/

    try {
        await sharp(req.file.path).metadata()
    } catch (error) {
        return next(new BadRequestError('Неверный формат изображения'))
    }
    
    // ТЕСТ 15: Проверка MIME type и расширения файла
    //const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
    //const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.svg'];
    
    /*const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    if (!allowedMimes.includes(req.file.mimetype) || !allowedExt.includes(fileExt)) {
        // Удаляем файл, если формат не поддерживается
        if (req.file.path) {
            fs.unlinkSync(req.file.path);
        }
        return next(new BadRequestError('Недопустимый формат файла'));
    }*/
    
    try {
        const fileName = process.env.UPLOAD_PATH
            ? `/${process.env.UPLOAD_PATH}/${req.file.filename}`
            : `/${req.file?.filename}`
        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: req.file?.originalname,
        })
    } catch (error) {
        return next(error)
    }
}
