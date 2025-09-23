import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import { Error as MongooseError } from 'mongoose'
import { join } from 'path'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import Product from '../models/product'
import movingFile from '../utils/movingFile'
import xss from 'xss'
import { Types } from 'mongoose'

// Функция для санитизации продукта
const sanitizeProduct = (product: any) => {
  const productObj = product.toObject ? product.toObject() : product
  return {
    ...productObj,
    title: xss(productObj.title),
    description: xss(productObj.description),
    category: xss(productObj.category)
  }
}

// Функция для безопасного поиска
const sanitizeSearch = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GET /product
const getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page = 1, limit = 5, search, category } = req.query
        
        // Безопасная фильтрация - защита от NoSQL инъекций
        const filter: any = {}
        
        if (search && typeof search === 'string') {
            const safeSearch = sanitizeSearch(search)
            filter.title = { $regex: safeSearch, $options: 'i' }
        }
        
        if (category && typeof category === 'string') {
            const safeCategory = xss(category.trim())
            filter.category = safeCategory
        }

        const options = {
            skip: (Number(page) - 1) * Number(limit),
            limit: Number(limit),
        }
        
        const products = await Product.find(filter, null, options)
        const totalProducts = await Product.countDocuments(filter)
        const totalPages = Math.ceil(totalProducts / Number(limit))
        
        // XSS защита при отправке данных
        const sanitizedProducts = products.map(sanitizeProduct)
        
        return res.send({
            items: sanitizedProducts,
            pagination: {
                totalProducts,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
            },
        })
    } catch (err) {
        return next(err)
    }
}

// POST /product
const createProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // XSS защита входных данных
        const { description, category, price, title, image } = req.body
        const sanitizedTitle = xss(title.trim())
        const sanitizedDescription = xss(description.trim())
        const sanitizedCategory = xss(category.trim())

        // Проверяем что image безопасный объект
        let sanitizedImage = null
        if (image && typeof image === 'object') {
            sanitizedImage = {
                fileName: xss(image.fileName),
                originalName: xss(image.originalName)
            }
        }

        // Переносим картинку из временной папки
        if (sanitizedImage) {
            movingFile(
                sanitizedImage.fileName,
                join(__dirname, `../public/${process.env.UPLOAD_PATH_TEMP}`),
                join(__dirname, `../public/${process.env.UPLOAD_PATH}`)
            )
        }

        const product = await Product.create({
            description: sanitizedDescription,
            image: sanitizedImage,
            category: sanitizedCategory,
            price: price ? Number(price) : null,
            title: sanitizedTitle,
        })
        
        // XSS защита при отправке ответа
        return res.status(constants.HTTP_STATUS_CREATED).send(sanitizeProduct(product))
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof Error && error.message.includes('E11000')) {
            return next(
                new ConflictError('Товар с таким заголовком уже существует')
            )
        }
        return next(error)
    }
}

// PUT /product
const updateProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { productId } = req.params
        
        // Проверяем валидность ID - защита от NoSQL инъекций
        if (!Types.ObjectId.isValid(productId)) {
            return next(new BadRequestError('Передан не валидный ID товара'))
        }

        // XSS защита обновляемых данных
        const updates: any = {}
        
        if (req.body.title) updates.title = xss(req.body.title.trim())
        if (req.body.description) updates.description = xss(req.body.description.trim())
        if (req.body.category) updates.category = xss(req.body.category.trim())
        if (req.body.price !== undefined) updates.price = req.body.price ? Number(req.body.price) : null
        
        // Обработка изображения
        if (req.body.image && typeof req.body.image === 'object') {
            updates.image = {
                fileName: xss(req.body.image.fileName),
                originalName: xss(req.body.image.originalName)
            }
            
            movingFile(
                updates.image.fileName,
                join(__dirname, `../public/${process.env.UPLOAD_PATH_TEMP}`),
                join(__dirname, `../public/${process.env.UPLOAD_PATH}`)
            )
        }

        const product = await Product.findByIdAndUpdate(
            productId,
            { $set: updates },
            { runValidators: true, new: true }
        ).orFail(() => new NotFoundError('Нет товара по заданному id'))
        
        // XSS защита при отправке ответа
        return res.send(sanitizeProduct(product))
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID товара'))
        }
        if (error instanceof Error && error.message.includes('E11000')) {
            return next(
                new ConflictError('Товар с таким заголовком уже существует')
            )
        }
        return next(error)
    }
}

// DELETE /product
const deleteProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { productId } = req.params
        
        // Проверяем валидность ID - защита от NoSQL инъекций
        if (!Types.ObjectId.isValid(productId)) {
            return next(new BadRequestError('Передан не валидный ID товара'))
        }

        const product = await Product.findByIdAndDelete(productId).orFail(
            () => new NotFoundError('Нет товара по заданному id')
        )
        
        // XSS защита при отправке ответа
        return res.send(sanitizeProduct(product))
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID товара'))
        }
        return next(error)
    }
}

export { createProduct, deleteProduct, getProducts, updateProduct }