PQSpy
=====

Firefox extension to quickly check if the webpage you're visiting
was protected using post-quantum encryption.

<img width="1036" alt="Screenshot 2024-08-21 at 14 23 55" src="https://github.com/user-attachments/assets/48e4050d-3bce-4140-a482-8510a41e7dcc">

Installation
------------

1. Go to `about:addons`
2. Click the gear, and then _Debug Add-Ons_.
3. Press *Load Temporary Add-on*.
4. Browse to `manifest.json`.

Also don't forget to turn on PQC (Kyber):

5. Go to `about:config` and set `security.tls.enable_kyber`
   (and `network.http.http3.enable_kyber` if present) to `true`.
