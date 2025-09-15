import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Types } from 'mongoose'
import validator from 'validator'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import xss from 'xss'

// Функция для санитизации пользователя
const sanitizeUser = (user: any) => {
  const userObj = user.toObject ? user.toObject() : user
  return {
    ...userObj,
    name: xss(userObj.name),
    email: xss(userObj.email),
    phone: userObj.phone ? xss(userObj.phone) : undefined
  }
}

const sanitizeSearch = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GET /customers
export const getCustomers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const {
            page = 1,
            limit = 10,
            sortField = 'createdAt',
            sortOrder = 'desc',
            registrationDateFrom,
            registrationDateTo,
            lastOrderDateFrom,
            lastOrderDateTo,
            totalAmountFrom,
            totalAmountTo,
            orderCountFrom,
            orderCountTo,
            search,
        } = req.query

        const filters: FilterQuery<Partial<IUser>> = {}

        // Безопасная фильтрация дат
        if (registrationDateFrom && typeof registrationDateFrom === 'string') {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(registrationDateFrom),
            }
        }

        if (registrationDateTo && typeof registrationDateTo === 'string') {
            const endOfDay = new Date(registrationDateTo)
            endOfDay.setHours(23, 59, 59, 999)
            filters.createdAt = {
                ...filters.createdAt,
                $lte: endOfDay,
            }
        }

        if (lastOrderDateFrom && typeof lastOrderDateFrom === 'string') {
            filters.lastOrderDate = {
                ...filters.lastOrderDate,
                $gte: new Date(lastOrderDateFrom),
            }
        }

        if (lastOrderDateTo && typeof lastOrderDateTo === 'string') {
            const endOfDay = new Date(lastOrderDateTo)
            endOfDay.setHours(23, 59, 59, 999)
            filters.lastOrderDate = {
                ...filters.lastOrderDate,
                $lte: endOfDay,
            }
        }

        // Безопасная фильтрация чисел
        if (totalAmountFrom) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $gte: Number(totalAmountFrom),
            }
        }

        if (totalAmountTo) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $lte: Number(totalAmountTo),
            }
        }

        if (orderCountFrom) {
            filters.orderCount = {
                ...filters.orderCount,
                $gte: Number(orderCountFrom),
            }
        }

        if (orderCountTo) {
            filters.orderCount = {
                ...filters.orderCount,
                $lte: Number(orderCountTo),
            }
        }

        // Безопасный поиск
        if (search && typeof search === 'string') {
            const safeSearch = sanitizeSearch(search)
            const searchRegex = new RegExp(safeSearch, 'i')
            const orders = await Order.find(
                {
                    $or: [{ deliveryAddress: searchRegex }],
                },
                '_id'
            )

            const orderIds = orders.map((order) => order._id)

            filters.$or = [
                { name: searchRegex },
                { lastOrder: { $in: orderIds } },
            ]
        }

        const sort: { [key: string]: any } = {}

        if (sortField && sortOrder) {
            const safeSortField = xss(sortField as string)
            sort[safeSortField] = sortOrder === 'desc' ? -1 : 1
        }

        const options = {
            sort,
            skip: (Number(page) - 1) * Number(limit),
            limit: Number(limit),
        }

        const users = await User.find(filters, null, options).populate([
            'orders',
            {
                path: 'lastOrder',
                populate: {
                    path: 'products',
                },
            },
            {
                path: 'lastOrder',
                populate: {
                    path: 'customer',
                },
            },
        ])

        const totalUsers = await User.countDocuments(filters)
        const totalPages = Math.ceil(totalUsers / Number(limit))

        // XSS защита при отправке
        const sanitizedUsers = users.map(sanitizeUser)

        res.status(200).json({
            customers: sanitizedUsers,
            pagination: {
                totalUsers,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
            },
        })
    } catch (error) {
        next(error)
    }
}

// Get /customers/:id
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = req.params
        
        // Валидация ID
        if (!Types.ObjectId.isValid(id)) {
            return next(new NotFoundError('Невалидный ID пользователя'))
        }

        const user = await User.findById(id).populate([
            'orders',
            'lastOrder',
        ])
        
        if (!user) {
            return next(new NotFoundError('Пользователь не найден'))
        }
        
        // XSS защита при отправке
        res.status(200).json(sanitizeUser(user))
    } catch (error) {
        next(error)
    }
}

// Patch /customers/:id
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = req.params
        
        // Валидация ID
        if (!Types.ObjectId.isValid(id)) {
            return next(new NotFoundError('Невалидный ID пользователя'))
        }

        // XSS защита обновляемых данных
        const updates: any = {}
        if (req.body.name) updates.name = xss(req.body.name.trim())
        if (req.body.phone) updates.phone = xss(req.body.phone.trim())
        if (req.body.email) updates.email = xss(req.body.email.trim())

        const updatedUser = await User.findByIdAndUpdate(
            id,
            updates,
            {
                new: true,
            }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )
            .populate(['orders', 'lastOrder'])
        
        // XSS защита при отправке
        res.status(200).json(sanitizeUser(updatedUser))
    } catch (error) {
        next(error)
    }
}

// Delete /customers/:id
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { id } = req.params
        
        // Валидация ID
        if (!Types.ObjectId.isValid(id)) {
            return next(new NotFoundError('Невалидный ID пользователя'))
        }

        const deletedUser = await User.findByIdAndDelete(id).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        
        // XSS защита при отправке
        res.status(200).json(sanitizeUser(deletedUser))
    } catch (error) {
        next(error)
    }
}