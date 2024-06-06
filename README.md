PQSpy
=====

Firefox extension to quickly check if the webpage you're visiting
was protected using post-quantum encryption.

<img width="1190" alt="Screenshot 2024-04-09 at 14 17 35" src="https://github.com/bwesterb/pqspy/assets/9975/ecf37da7-14c4-4149-80a5-b19d153b46fc">

Installation
------------

1. Go to `about:addons`
2. Click the gear, and then _Debug Add-Ons_.
3. Press *Load Temporary Add-on*.
4. Browse to `manifest.json`.

Also don't forget to turn on PQC (Kyber):

5. Go to `about:config` and set `security.tls.enable_kyber`
   (and `network.http.http3.enable_kyber` if present) to `true`.

⚠️ As of writing, Firefox does not support PQC over HTTP/3 (yet),
so you might see false negatives. ⚠️

(PQC over HTTP/3 will will land in Firefox 126. Available in nightly.)
