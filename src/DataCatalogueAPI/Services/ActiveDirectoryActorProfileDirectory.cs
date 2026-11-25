using System.DirectoryServices;
using System.Security.Principal;
using DataCatalague.Api.Models.V1;

namespace DataCatalague.Api.Services;

public interface IActorProfileDirectory
{
    ActorProfileResponse? Find(string actor);
}

/// <summary>Reads only the two requested AD attributes under the API's Windows execution identity.</summary>
public sealed class ActiveDirectoryActorProfileDirectory : IActorProfileDirectory
{
    public ActorProfileResponse? Find(string actor) {
        if (!ActorProfileService.IsDirectoryAccount(actor)) { return null; }

        // Resolve the full domain-qualified account to a SID. Searching by the
        // unqualified account name alone could attach a different user's photo.
        var sid = (SecurityIdentifier)new NTAccount(actor).Translate(typeof(SecurityIdentifier));
        var sidBytes = new byte[sid.BinaryLength];
        sid.GetBinaryForm(sidBytes, 0);
        var escapedSid = string.Concat(sidBytes.Select(value => $"\\{value:X2}"));

        // Default naming context, integrated credentials, no referrals to other domains.
        using var root = new DirectoryEntry { AuthenticationType = AuthenticationTypes.Secure | AuthenticationTypes.Signing | AuthenticationTypes.Sealing };
        using var search = new DirectorySearcher(root) {
            Filter = $"(&(objectCategory=person)(objectClass=user)(objectSid={escapedSid}))",
            SearchScope = SearchScope.Subtree,
            ReferralChasing = ReferralChasingOption.None,
            ClientTimeout = TimeSpan.FromSeconds(3),
            ServerTimeLimit = TimeSpan.FromSeconds(2),
            SizeLimit = 1,
            CacheResults = false,
        };
        search.PropertiesToLoad.Add("displayName");
        search.PropertiesToLoad.Add("thumbnailPhoto");
        var result = search.FindOne();
        if (result is null) { return null; }
        var name = result.Properties["displayname"].Count > 0 ? result.Properties["displayname"][0] as string : null;
        var photo = result.Properties["thumbnailphoto"].Count > 0 ? result.Properties["thumbnailphoto"][0] as byte[] : null;
        return CreateProfile(actor, name, photo);
    }

    public static ActorProfileResponse? CreateProfile(string actor, string? displayName, byte[]? photo) {
        var name = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim();
        if (name?.Length > 256) { name = null; }
        // AD thumbnails are limited to 100 KiB. Never return SVG, arbitrary HTML,
        // or unsupported image types; the browser still handles decode failures.
        string? mediaType = null;
        if (photo is { Length: > 0 and <= 102400 }) {
            if (photo.AsSpan().StartsWith(new byte[] { 0xFF, 0xD8, 0xFF })) { mediaType = "image/jpeg"; }
            else if (photo.AsSpan().StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) { mediaType = "image/png"; }
        }
        return name is null && mediaType is null ? null : new ActorProfileResponse(actor, name, mediaType, mediaType is null ? null : Convert.ToBase64String(photo!));
    }
}
