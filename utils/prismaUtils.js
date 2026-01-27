/**
 * Formats Prisma errors into human-readable messages or standardized error codes
 * @param {Error} error 
 * @returns {Object} { message: string, status: number }
 */
export const handlePrismaError = (error) => {
    if (error.code === 'P2002') {
        const target = error.meta?.target || 'field';
        return {
            message: `A record with this ${target} already exists.`,
            status: 409
        };
    }

    if (error.code === 'P2025') {
        return {
            message: error.meta?.cause || 'Record not found.',
            status: 404
        };
    }

    if (error.code === 'P2003') {
        return {
            message: 'Foreign key constraint failed. Related record not found.',
            status: 400
        };
    }

    // Handle other common codes as needed
    console.error('[Prisma Error]:', error);

    return {
        message: error.message || 'An unexpected database error occurred.',
        status: 500
    };
};

/**
 * Exclude specified fields from an object
 * @param {Object} obj 
 * @param {Array<string>} keys 
 * @returns {Object}
 */
export const excludeFields = (obj, keys) => {
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => !keys.includes(key))
    );
};

/**
 * Fix for JSON.stringify failing on BigInt types returned by Prisma
 * Call this in your response handlers if needed
 */
export const patchBigInt = () => {
    BigInt.prototype.toJSON = function () {
        return this.toString();
    };
};
