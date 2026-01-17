/**
 * Standardized success response
 */
export const successResponse = (res, data, message = 'Success', status = 200) => {
    return res.status(status).json({
        success: true,
        message,
        ...data
    });
};

/**
 * Standardized error response
 */
export const errorResponse = (res, message = 'Internal Server Error', status = 500, error = null) => {
    const response = {
        success: false,
        message
    };

    if (error && process.env.NODE_ENV !== 'production') {
        response.error = error.message || error;
        response.stack = error.stack;
    }

    return res.status(status).json(response);
};

/**
 * Common validation error response
 */
export const validationErrorResponse = (res, errors) => {
    return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
    });
};
