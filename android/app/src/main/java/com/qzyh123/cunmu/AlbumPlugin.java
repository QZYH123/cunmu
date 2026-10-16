package com.qzyh123.cunmu;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 存成一张长图 on Android: the PNG goes into the photo library (Pictures/存目), nothing else is opened.
 * Android 10+ writes through MediaStore and needs no permission; 7–9 write the public Pictures folder,
 * which asks for storage access once.
 */
@CapacitorPlugin(
    name = "Album",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class AlbumPlugin extends Plugin {
    private static final String FOLDER = "存目";

    @PluginMethod
    public void savePng(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageGranted");
            return;
        }
        write(call);
    }

    @PermissionCallback
    private void storageGranted(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) write(call);
        else call.reject("denied", "DENIED");
    }

    private void write(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "存目.png");
        if (data == null) { call.reject("no data"); return; }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + FOLDER);
                v.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) { call.reject("insert failed"); return; }
                try (OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new Exception("no stream");
                    out.write(bytes);
                } catch (Exception e) {
                    cr.delete(uri, null, null);
                    throw e;
                }
                v.clear();
                v.put(MediaStore.Images.Media.IS_PENDING, 0);
                cr.update(uri, v, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER);
                if (!dir.exists() && !dir.mkdirs()) { call.reject("no folder"); return; }
                File f = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { "image/png" }, null);
            }
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), e);
        }
    }
}
