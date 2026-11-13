using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;

namespace TestProductCatalogueAPI;

/// <summary>Records emitted log levels and exceptions without configuring a process-wide logging provider.</summary>
internal sealed class TestLogCapture<TCategory> : ILogger<TCategory>
{
    /// <summary>Actual log events emitted by the service/job under test.</summary>
    public ConcurrentQueue<(LogLevel Level, Exception? Exception, string Message)> Entries { get; } = new();

    /// <summary>No external scope resources are allocated by this capture.</summary>
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    /// <summary>Captures every level so a test cannot accidentally filter away an Error.</summary>
    public bool IsEnabled(LogLevel logLevel) => true;

    /// <summary>Retains the actual message, severity and exception passed through ILogger.</summary>
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => Entries.Enqueue((logLevel, exception, formatter(state, exception)));
}
