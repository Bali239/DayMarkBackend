export const SuccessResponse = (res, data, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({
   statusCode, 
   status: "success",
    message,
    data,
  });
};

export const ErrorResponse = (res, message = "Error", statusCode = 500) => {
  return res.status(statusCode).json({
    statusCode,
    status: "error",
    message,
    data: null,
  });
};
