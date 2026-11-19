// Copyright © 2026 徐天翼（笔名：鸡腿堡）
// SPDX-License-Identifier: GPL-3.0-only
#import "PaperProxy.h"
#import <Network/Network.h>
#import <dlfcn.h>

// Public Sonoma APIs, weak-linked so the same binary runs on Ventura.
#if __MAC_OS_X_VERSION_MAX_ALLOWED < 140000
typedef void *(*CreateHTTPProxy)(nw_endpoint_t,nw_protocol_options_t);
typedef void *(*CreateSOCKSProxy)(nw_endpoint_t);
typedef void (*SetFailover)(id,bool);
@interface WKWebsiteDataStore (PaperProfiles)
+ (instancetype)dataStoreForIdentifier:(NSUUID *)identifier;
@end
@protocol PaperProxySettings
- (void)setProxyConfigurations:(NSArray *)value;
@end
#else
@protocol PaperProxySettings
- (void)setProxyConfigurations:(NSArray *)value;
@end
#endif
WKWebsiteDataStore *PaperWebsiteStore(NSUUID *identifier){
    if (@available(macOS 14.0,*)) return [WKWebsiteDataStore dataStoreForIdentifier:identifier];
    return [WKWebsiteDataStore defaultDataStore];
}
BOOL PaperSetProxy(id configuration,NSString *kind,NSString *host,NSString *port){
    if (@available(macOS 14.0,*)) {
        if (![configuration respondsToSelector:@selector(setProxyConfigurations:)]) return NO;
        if (!kind.length) {[(id<PaperProxySettings>)configuration setProxyConfigurations:@[]];return YES;}
        nw_endpoint_t endpoint=nw_endpoint_create_host(host.UTF8String,port.UTF8String);
        if (!endpoint) return NO;
        BOOL campus=[kind isEqual:@"campus"];
        id proxy;
#if __MAC_OS_X_VERSION_MAX_ALLOWED < 140000
        CreateHTTPProxy http=(CreateHTTPProxy)dlsym(RTLD_DEFAULT,"nw_proxy_config_create_http_connect");
        CreateSOCKSProxy socks=(CreateSOCKSProxy)dlsym(RTLD_DEFAULT,"nw_proxy_config_create_socksv5");
        SetFailover failover=(SetFailover)dlsym(RTLD_DEFAULT,"nw_proxy_config_set_failover_allowed");
        if (!http || !socks || !failover) return NO;
        if ([kind isEqual:@"socks5"]) proxy=CFBridgingRelease(socks(endpoint));
        else if (campus || [kind isEqual:@"http"]) proxy=CFBridgingRelease(http(endpoint,nil));
        else return NO;
        if (!proxy) return NO;
        failover(proxy,false);
#else
        if ([kind isEqual:@"socks5"]) proxy=nw_proxy_config_create_socksv5(endpoint);
        else if (campus || [kind isEqual:@"http"]) proxy=nw_proxy_config_create_http_connect(endpoint,nil);
        else return NO;
        if (!proxy) return NO;
        nw_proxy_config_set_failover_allowed(proxy,false);
#endif
        if (campus) {
            // University identity providers and CARSI must use the normal system route.
#if __MAC_OS_X_VERSION_MAX_ALLOWED < 140000
            void (*matchDomain)(id,const char *)=dlsym(RTLD_DEFAULT,"nw_proxy_config_add_match_domain");
            if (!matchDomain) return NO;
            matchDomain(proxy,"cnki.net");
            matchDomain(proxy,"cnki.com.cn");
#else
            nw_proxy_config_add_match_domain(proxy,"cnki.net");
            nw_proxy_config_add_match_domain(proxy,"cnki.com.cn");
#endif
        }
        [(id<PaperProxySettings>)configuration setProxyConfigurations:@[proxy]];
        return YES;
    }
    return !kind.length;
}

// libarchive is shipped with macOS, including on systems without developer tools.
struct archive; struct archive_entry;
extern struct archive *archive_read_new(void);
extern int archive_read_support_format_zip(struct archive *);
extern int archive_read_open_filename(struct archive *,const char *,size_t);
extern int archive_read_next_header(struct archive *,struct archive_entry **);
extern const char *archive_entry_pathname_utf8(struct archive_entry *);
extern unsigned int archive_entry_filetype(struct archive_entry *);
extern long long archive_entry_size(struct archive_entry *);
extern ssize_t archive_read_data(struct archive *,void *,size_t);
extern int archive_read_free(struct archive *);
BOOL WorkspaceZIP(NSURL *url, BOOL (^visit)(NSString *,long long), BOOL (^consume)(NSString *,NSData *), NSError **error) {
    struct archive *a=archive_read_new();archive_read_support_format_zip(a);
    BOOL ok=archive_read_open_filename(a,url.fileSystemRepresentation,65536)==0;
    struct archive_entry *entry; int status=0; NSUInteger count=0;
    while(ok && (status=archive_read_next_header(a,&entry))==0) {
        if(++count>100000){ok=NO;break;}
        if(archive_entry_filetype(entry)!=0100000)continue;
        const char *raw=archive_entry_pathname_utf8(entry);if(!raw)continue;
        NSString *name=[NSString stringWithUTF8String:raw];
        if(!name || !visit(name,archive_entry_size(entry)))continue;
        @autoreleasepool {
            NSMutableData *bytes=[NSMutableData data];char chunk[65536];ssize_t n;
            while((n=archive_read_data(a,chunk,sizeof(chunk)))>0) {
                if(bytes.length+(NSUInteger)n>64*1024*1024){ok=NO;break;}
                [bytes appendBytes:chunk length:n];
            }
            if(n<0 || (ok && !consume(name,bytes)))ok=NO;
        }
    }
    if(status!=1)ok=NO;archive_read_free(a);
    if(!ok && error)*error=[NSError errorWithDomain:@"WorkspaceArchive" code:1 userInfo:@{NSLocalizedDescriptionKey:@"压缩文件无法完整读取，可能已加密、损坏或超出导入容量。"}];return ok;
}
