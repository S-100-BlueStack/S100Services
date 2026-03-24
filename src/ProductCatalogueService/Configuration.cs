using System.Security.Cryptography;
using System.Text;

namespace ProductCatalogueService
{
    public static class Configuration
    {
        public static string DecryptString(string cipherText) {
            var key = Environment.GetEnvironmentVariable("productcatalogue_decryption_key");
            if(key == null)
                throw new ArgumentNullException(nameof(key));

            var iv = new byte[16];
            var buffer = Convert.FromBase64String(cipherText);

            using Aes aes = Aes.Create();
            aes.Key = Encoding.UTF8.GetBytes(key);
            aes.IV = iv;
            var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);

            using MemoryStream memoryStream = new(buffer);
            using CryptoStream cryptoStream = new((Stream)memoryStream, decryptor, CryptoStreamMode.Read);
            using StreamReader streamReader = new((Stream)cryptoStream);
            return streamReader.ReadToEnd();
        }
    }
}