using System.Security.Cryptography;
using System.Text;

namespace ProductCatalogueAPI
{
    public static class Configuration
    {
        public static string DecryptString(string cipherText) {
            var iv = new byte[16];
            var buffer = Convert.FromBase64String(cipherText);

            using Aes aes = Aes.Create();
            aes.Key = GetKey();
            aes.IV = iv;

            var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);

            using var memoryStream = new MemoryStream(buffer);
            using var cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Read);
            using var streamReader = new StreamReader(cryptoStream);

            return streamReader.ReadToEnd();
        }

        public static string EncryptString(string plainText) {
            var iv = new byte[16];

            using Aes aes = Aes.Create();
            aes.Key = GetKey();
            aes.IV = iv;

            var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);

            using var memoryStream = new MemoryStream();
            using (var cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write))
            using (var streamWriter = new StreamWriter(cryptoStream)) {
                streamWriter.Write(plainText);
            }

            return Convert.ToBase64String(memoryStream.ToArray());
        }

        private static byte[] GetKey() {
            var key = Environment.GetEnvironmentVariable("productcatalogue_encryption_key");
            if (key == null)
                throw new ArgumentNullException(nameof(key));

            return Convert.FromBase64String(key);
        }

    }
}