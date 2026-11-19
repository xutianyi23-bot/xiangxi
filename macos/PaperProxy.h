#import <WebKit/WebKit.h>
NS_ASSUME_NONNULL_BEGIN
WKWebsiteDataStore *PaperWebsiteStore(NSUUID *identifier);
BOOL PaperSetProxy(id configuration, NSString *kind, NSString *host, NSString *port);
NS_ASSUME_NONNULL_END
FOUNDATION_EXPORT BOOL WorkspaceZIP(NSURL * _Nonnull url, BOOL (^ _Nonnull visit)(NSString * _Nonnull name, long long size), BOOL (^ _Nonnull consume)(NSString * _Nonnull name, NSData * _Nonnull data), NSError * _Nullable * _Nullable error);
