using System.IO.Compression;
using System.Text;


namespace S100FC.ProductCatalogue
{
    public static class Extensions
    {
        public static MemoryStream ZipIt(string yaml, string index, string sign) {
            var zipStream = new MemoryStream();

            using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true)) {
                AddFileToArchive(archive, "yaml", yaml);
                AddFileToArchive(archive, "index", index);
                AddFileToArchive(archive, "sign", sign);
            }

            // 4. Reset position so the reader starts at the beginning
            zipStream.Position = 0;

            return zipStream;

            static void AddFileToArchive(ZipArchive archive, string fileName, string content) {
                var entry = archive.CreateEntry(fileName);
                using var entryStream = entry.Open();
                using var writer = new StreamWriter(entryStream, Encoding.UTF8);
                writer.Write(content);
            }
        }
        public static Dictionary<string, string> ReadZippedData(MemoryStream stream) {
            var files = new Dictionary<string, string>();
            stream.Position = 0;

            // Open the stream as a ZipArchive
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);

            foreach (ZipArchiveEntry entry in archive.Entries) {
                var key = entry.Name;
                if (entry.Name.EndsWith(".yaml", StringComparison.InvariantCultureIgnoreCase))
                    key = "yaml";
                else if (entry.Name.EndsWith(".idx", StringComparison.InvariantCultureIgnoreCase))
                    key = "index";
                else if (entry.Name.EndsWith(".sign", StringComparison.InvariantCultureIgnoreCase))
                    key = "catalogue";

                using var entryStream = entry.Open();
                using var reader = new StreamReader(entryStream);
                files.Add(entry.FullName, reader.ReadToEnd());
            }

            return files;
        }

    }
}
