/* SPDX-License-Identifier: GPL-3.0-or-later */
import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

public final class SignApk {
    public static void main(String[] args) throws Exception {
        char[] password = System.getenv("OPENTAKE_APK_PASSWORD").toCharArray();
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (FileInputStream input = new FileInputStream(args[0])) {
            store.load(input, password);
        }
        PrivateKey key = (PrivateKey) store.getKey("opentake", password);
        X509Certificate cert = (X509Certificate) store.getCertificate("opentake");
        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder(
            "OPENTAKE", key, Collections.singletonList(cert)).build();
        File output = new File(args[2]);
        new ApkSigner.Builder(Collections.singletonList(signer))
            .setInputApk(new File(args[1])).setOutputApk(output)
            .setMinSdkVersion(26).setV1SigningEnabled(false).setV2SigningEnabled(true)
            .build().sign();
        ApkVerifier.Result result = new ApkVerifier.Builder(output).build().verify();
        if (!result.isVerified() || !result.isVerifiedUsingV2Scheme()) {
            throw new IllegalStateException("APK verification failed: " + result.getErrors());
        }
        System.out.println("APK signature verified (v2).");
    }
}
