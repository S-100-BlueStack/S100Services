using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using ProductManagerAPI.Services.Export;

namespace ProductManagerAPI.Filters
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class ValidateExportTargetAttribute : Attribute, IAsyncActionFilter
    {
        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next) {
            var query = context.HttpContext.Request.Query;
            var rawTarget = query.ContainsKey(ExportTargetContract.QueryParameterName)
                ? query[ExportTargetContract.QueryParameterName].ToString()
                : null;

            var validation = ExportTargetContract.ParseAndValidate(rawTarget);

            if (!validation.IsValid) {
                var problemDetails = validation.ProblemDetails!;
                var result = new ObjectResult(problemDetails) {
                    StatusCode = problemDetails.Status
                };
                result.ContentTypes.Add("application/problem+json");
                context.Result = result;
                return;
            }

            ExportTargetContract.SetValidatedTarget(context.HttpContext, validation.Target!.Value);
            await next();
        }
    }
}
